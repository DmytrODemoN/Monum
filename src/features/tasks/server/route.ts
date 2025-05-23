import { z } from "zod";
import { Hono } from "hono";
import { ID, Query } from "node-appwrite";
import { zValidator } from "@hono/zod-validator";
import {
  COMMENTS_ID,
  DATABASES_ID,
  MEMBERS_ID,
  PROJECTS_ID,
  TASKS_ID,
} from "@/config";

import { Project } from "@/features/projects/types";
import { getMember } from "@/features/members/utils";

import { cascadeDelete } from "@/lib/utils";
import { createAdminClient } from "@/lib/appwrite";
import { sessionMiddleware } from "@/lib/session-middleware";

import { createTaskComment, createTaskSchema } from "../schemas";
import { Comment, Task, TaskPriority, TaskStatus } from "../types";
import { useNotificateEmail } from "../hooks/use-notificate-email";

const app = new Hono()
  .delete("/:taskId", sessionMiddleware, async (c) => {
    const user = c.get("user");
    const databases = c.get("databases");
    const { taskId } = c.req.param();

    const task = await databases.getDocument<Task>(
      DATABASES_ID,
      TASKS_ID,
      taskId
    );

    const member = await getMember({
      databases,
      workspaceId: task.workspaceId,
      userId: user.$id,
    });

    if (!member) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    await cascadeDelete(
      databases,
      DATABASES_ID,
      TASKS_ID,
      [Query.equal("$id", taskId)],
      [{ collectionId: COMMENTS_ID, foreignKey: "taskId" }]
    );

    return c.json({ data: { $id: task.$id } });
  })
  .get(
    "/",
    sessionMiddleware,
    zValidator(
      "query",
      z.object({
        workspaceId: z.string(),
        projectId: z.string().nullish(),
        assigneeId: z.string().nullish(),
        status: z.nativeEnum(TaskStatus).nullish(),
        priority: z.nativeEnum(TaskPriority).nullish(),
        search: z.string().nullish(),
        dueDate: z.string().nullish(),
      })
    ),
    async (c) => {
      const { users } = await createAdminClient();
      const databases = c.get("databases");
      const user = c.get("user");

      const { workspaceId, projectId, status, priority, search, assigneeId, dueDate } =
        c.req.valid("query");

      const member = await getMember({
        databases,
        workspaceId,
        userId: user.$id,
      });

      if (!member) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const query = [
        Query.equal("workspaceId", workspaceId),
        Query.orderDesc("$createdAt"),
      ];

      if (projectId) {
        query.push(Query.equal("projectId", projectId));
      }

      if (status) {
        query.push(Query.equal("status", status));
      }

      if (priority) {
        query.push(Query.equal("priority", priority));
      }

      if (assigneeId) {
        query.push(Query.equal("assigneeId", assigneeId));
      }

      if (dueDate) {
        query.push(Query.equal("dueDate", dueDate));
      }

      if (search) {
        query.push(Query.equal("search", search));
      }

      const tasks = await databases.listDocuments<Task>(
        DATABASES_ID,
        TASKS_ID,
        query
      );

      const projectIds = tasks.documents.map((task) => task.projectId);
      const assigneeIds = tasks.documents.map((task) => task.assigneeId);

      const projects = await databases.listDocuments<Project>(
        DATABASES_ID,
        PROJECTS_ID,
        projectIds.length > 0 ? [Query.contains("$id", projectIds)] : []
      );

      const members = await databases.listDocuments<Project>(
        DATABASES_ID,
        MEMBERS_ID,
        assigneeIds.length > 0 ? [Query.contains("$id", assigneeIds)] : []
      );

      const assignees = await Promise.all(
        members.documents.map(async (member) => {
          const user = await users.get(member.userId);

          return {
            ...member,
            name: user.name || user.email,
            email: user.email,
          };
        })
      );

      const populatedTasks = tasks.documents.map((task) => {
        const project = projects.documents.find(
          (project) => project.$id === task.projectId
        );

        const assignee = assignees.find(
          (assignee) => assignee.$id === task.assigneeId
        );

        return {
          ...task,
          project,
          assignee,
        };
      });

      return c.json({
        data: {
          ...tasks,
          documents: populatedTasks,
        },
      });
    }
  )
  .post(
    "/",
    sessionMiddleware,
    zValidator("json", createTaskSchema),
    async (c) => {
      const user = c.get("user");
      const databases = c.get("databases");
      const { name, status, priority, workspaceId, projectId, dueDate, assigneeId } =
        c.req.valid("json");

      const member = await getMember({
        databases,
        workspaceId,
        userId: user.$id,
      });

      if (!member) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const highestPositionTask = await databases.listDocuments(
        DATABASES_ID,
        TASKS_ID,
        [
          Query.equal("status", status),
          Query.equal("workspaceId", workspaceId),
          Query.orderAsc("position"),
          Query.limit(1),
        ]
      );

      const newPosition =
        highestPositionTask.documents.length > 0
          ? highestPositionTask.documents[0].position + 1000
          : 1000;

      const task = await databases.createDocument(
        DATABASES_ID,
        TASKS_ID,
        ID.unique(),
        {
          name,
          status,
          priority,
          workspaceId,
          projectId,
          dueDate,
          assigneeId,
          position: newPosition,
        }
      );

      const assigneeUser = await databases.getDocument(
        DATABASES_ID,
        MEMBERS_ID,
        assigneeId
      );

      useNotificateEmail({
        userId: assigneeUser.userId,
        taskId: task.$id,
        workspaceId: task.workspaceId,
        subject: "New task assigned",
        taskName: task.name,
        firstParagraph: `You have a new task assigned to you: `,
      });

      return c.json({ data: task });
    }
  )
  .patch(
    "/:taskId",
    sessionMiddleware,
    zValidator("json", createTaskSchema.partial()),
    async (c) => {
      const user = c.get("user");
      const databases = c.get("databases");
      const { name, status, priority, description, projectId, dueDate, assigneeId } =
        c.req.valid("json");

      const { taskId } = c.req.param();

      const existingTask = await databases.getDocument<Task>(
        DATABASES_ID,
        TASKS_ID,
        taskId
      );

      const member = await getMember({
        databases,
        workspaceId: existingTask.workspaceId,
        userId: user.$id,
      });

      if (!member) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const task = await databases.updateDocument<Task>(
        DATABASES_ID,
        TASKS_ID,
        taskId,
        {
          name,
          status,
          priority,
          projectId,
          dueDate,
          assigneeId,
          description,
        }
      );

      const assigneeUser = await databases.getDocument(
        DATABASES_ID,
        MEMBERS_ID,
        assigneeId ?? existingTask.assigneeId
      );

      useNotificateEmail({
        userId: assigneeUser.userId,
        taskId: task.$id,
        workspaceId: task.workspaceId,
        subject: "Task updated",
        taskName: task.name,
        firstParagraph: `The task has been updated: `,
      });

      return c.json({ data: task });
    }
  )
  .get("/:taskId", sessionMiddleware, async (c) => {
    const currentUser = c.get("user");
    const databases = c.get("databases");
    const { users } = await createAdminClient();
    const { taskId } = c.req.param();

    const task = await databases.getDocument<Task>(
      DATABASES_ID,
      TASKS_ID,
      taskId
    );

    const currentMember = await getMember({
      databases,
      workspaceId: task.workspaceId,
      userId: currentUser.$id,
    });

    if (!currentMember) {
      return c.json({ error: "Unathorized" }, 401);
    }

    const project = await databases.getDocument<Project>(
      DATABASES_ID,
      PROJECTS_ID,
      task.projectId
    );

    const member = await databases.getDocument<Project>(
      DATABASES_ID,
      MEMBERS_ID,
      task.assigneeId
    );

    const comments = await databases.listDocuments<Comment>(
      DATABASES_ID,
      COMMENTS_ID,
      [Query.equal("taskId", taskId)]
    );

    const user = await users.get(member.userId);

    const assignee = {
      ...member,
      name: user.name || user.email,
      email: user.email,
    };

    return c.json({
      data: {
        ...task,
        project,
        assignee,
        comments,
        userId: currentUser.$id,
      },
    });
  })
  .post(
    "/bulk-update",
    sessionMiddleware,
    zValidator(
      "json",
      z.object({
        tasks: z.array(
          z.object({
            $id: z.string(),
            status: z.nativeEnum(TaskStatus),
            position: z.number().int().positive().min(1000).max(1_000_000),
          })
        ),
      })
    ),
    async (c) => {
      const databases = c.get("databases");
      const user = c.get("user");
      const { tasks } = c.req.valid("json");

      const tasksToUpdate = await databases.listDocuments<Task>(
        DATABASES_ID,
        TASKS_ID,
        [
          Query.contains(
            "$id",
            tasks.map((task) => task.$id)
          ),
        ]
      );

      const workspaceIds = new Set(
        tasksToUpdate.documents.map((task) => task.workspaceId)
      );
      if (workspaceIds.size !== 1) {
        return c.json({ error: "All tasks must belong to the same workspace" });
      }

      const workspaceId = workspaceIds.values().next().value;

      if (!workspaceId) {
        return c.json({ error: "Workspace ID is required" }, 400);
      }

      const member = await getMember({
        databases,
        workspaceId,
        userId: user.$id,
      });

      if (!member) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const updatedTasks = await Promise.all(
        tasks.map(async (task) => {
          const { $id, status, position } = task;
          return databases.updateDocument<Task>(DATABASES_ID, TASKS_ID, $id, {
            status,
            position,
          });
        })
      );

      return c.json({ data: updatedTasks });
    }
  )
  .post(
    "/:workspaceId/tasks/:taskId/comments",
    sessionMiddleware,
    zValidator("json", createTaskComment),
    async (c) => {
      const databases = c.get("databases");
      const user = c.get("user");
      const { workspaceId, taskId } = c.req.param();
      const comment = c.req.valid("json");

      const member = await getMember({
        databases,
        workspaceId,
        userId: user.$id,
      });

      if (!member) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const post = await databases.createDocument(
        DATABASES_ID,
        COMMENTS_ID,
        ID.unique(),
        {
          workspaceId,
          taskId,
          userId: user.$id,
          userName: user.name || user.email,
          text: comment.text,
        }
      );

      const { name, assigneeId } = await databases.getDocument<Task>(
        DATABASES_ID,
        TASKS_ID,
        taskId
      );

      const assigneeUser = await databases.getDocument(
        DATABASES_ID,
        MEMBERS_ID,
        assigneeId
      );

      useNotificateEmail({
        userId: assigneeUser.userId,
        taskId: taskId,
        workspaceId: workspaceId,
        subject: "New comment on your task",
        taskName: name,
        firstParagraph: `A new comment has been added to your task: `,
      });

      return c.json({ success: true, data: post });
    }
  )
  .delete(
    "/:workspaceId/tasks/:taskId/comments/:commentId",
    sessionMiddleware,
    async (c) => {
      const user = c.get("user");
      const databases = c.get("databases");
      const { workspaceId, taskId, commentId } = c.req.param();

      const member = await getMember({
        databases,
        workspaceId: workspaceId,
        userId: user.$id,
      });

      if (!member) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      await databases.deleteDocument(DATABASES_ID, COMMENTS_ID, commentId);

      return c.json({ data: { $id: taskId } });
    }
  );

export default app;
