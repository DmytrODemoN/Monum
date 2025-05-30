import { Loader } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

import { CreateTaskForm } from "./create-task-form";

import { useGetMembers } from "@/features/members/api/use-get-members";
import { useGetProjects } from "@/features/projects/api/use-get-projects";
import { useWorkspaceId } from "@/features/workspaces/hooks/use-workspace-id";
import { useCreateTaskModal } from "../hooks/use-create-task-modal";

interface CreateTaskFormWrapperProps {
  onCancel: () => void;
  status: string;
}

export const CreateTaskFormWrapper = ({
  onCancel,
}: CreateTaskFormWrapperProps) => {
  const workspaceId = useWorkspaceId();

  const { data: projects, isLoading: isLoadingProjects } = useGetProjects({ workspaceId });
  const { data: members, isLoading: isLoadingMembers } = useGetMembers({ workspaceId });

  const { status } = useCreateTaskModal();

  const projectOptions = projects?.documents.map((project) => ({
    id: project.$id,
    name: project.name,
    imageUrl: project.imageUrl,
  }));

  const memberOptions = members?.documents.map((project) => ({
    id: project.$id,
    name: project.name,
  }));

  const isLoading = isLoadingProjects || isLoadingMembers;

  if (isLoading) {
    <Card className="w-full h-[714px] border-none shadow-none">
      <CardContent className="flex items-center justify-center h-full">
        <Loader className="size-5 animate-spin text-muted-foreground" />
      </CardContent>
    </Card>
  }

  return (
    <div>
      <CreateTaskForm
        onCancel={onCancel}
        status={status}
        projectOpions={projectOptions ?? []}
        memberOpions={memberOptions ?? []}
      />
    </div>
  )
}