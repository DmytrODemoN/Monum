import { Task } from "../types";
import { TaskActions } from "./task-actions";

import { MoreHorizontal } from "lucide-react";
import { Separator } from "@radix-ui/react-dropdown-menu";

import { MemberAvatar } from "@/features/members/components/member-avatar";
import { TaskDate } from "./task-date";
import { ProjectAvatar } from "@/features/projects/components/project-avatar";
import { Badge } from "@/components/ui/badge";

interface KanbanCardProps {
  task: Task;
};

export const KanbanCard = ({ task }: KanbanCardProps) => {
  return (
    <div className="bg-white dark:bg-[#ffffff1a] p-2.5 mb-1.5 rounded shadow-sm space-y-3">
      <div className="flex items-start justify-between gap-x-2">
        <p className="text-sm line-clamp-2">{task.name}</p>
        <TaskActions id={task.$id} projectId={task.projectId} >
          <MoreHorizontal className="size-[18px] stroke-1 shrink-0 text-zinc-700 dark:text-zinc-400 hover:opacity-75 transition" />
        </TaskActions>
      </div>
      <div className="my-8 h-0.5 bg-gray-200">
        <Separator />
      </div>
      <div className="flex items-center gap-x-1.5">
        <MemberAvatar
          name={task.assignee.name}
          fallbackClassName="text-[10px]"
        />
        <div className="size-1 rounded-full bg-neutral-300" />
        <TaskDate value={task.dueDate} className="text-xs" />
      </div>
      <div className="flex items-center gap-x-1.5">
        <ProjectAvatar
          name={task.project.name}
          image={task.project.imageUrl}
          fallbackClassName="text-[10px]"
        />
        <span className="text-xs font-medium">{task.project.name}</span>
        <div className="size-1 rounded-full bg-neutral-300" />
        <Badge variant={task.priority} className="text-[10px] dark:text-zinc-300 font-medium">
          {task.priority}
        </Badge>
      </div>
    </div>
  )
}