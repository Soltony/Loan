"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { Role } from "@/lib/types";
import { RoleForm } from "./role-form";

interface AddRoleDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (role: Omit<Role, "id">) => void;
  role: Role | null;
  primaryColor?: string;
}

export function AddRoleDialog({
  isOpen,
  onClose,
  onSave,
  role,
  primaryColor = "#fdb913",
}: AddRoleDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{role ? "Edit Role" : "Add New Role"}</DialogTitle>
          <DialogDescription>
            {role
              ? "Update the details of the existing role."
              : "Define a new role and its permissions."}
          </DialogDescription>
        </DialogHeader>
        <RoleForm
          role={role}
          primaryColor={primaryColor}
          onCancel={onClose}
          onSave={(data) => {
            onSave(data);
            onClose();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
