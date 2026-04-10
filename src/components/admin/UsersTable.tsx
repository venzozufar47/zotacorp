"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { toast } from "sonner";
import { format } from "date-fns";

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  role: "employee" | "admin";
  created_at: string;
}

interface UsersTableProps {
  rows: UserRow[];
  currentUserId: string;
}

export function UsersTable({ rows, currentUserId }: UsersTableProps) {
  const router = useRouter();
  const [target, setTarget] = useState<UserRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  if (rows.length === 0) {
    return (
      <EmptyState
        icon="👥"
        title="No users yet"
        description="New sign-ups will appear here."
      />
    );
  }

  async function handleDelete() {
    if (!target) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/admin/users/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: target.id }),
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(body.error ?? "Failed to delete user");
        setDeleting(false);
        return;
      }

      toast.success(`Deleted ${target.full_name || target.email}`);
      setTarget(null);
      setDeleting(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="rounded-xl border overflow-hidden bg-white">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#f5f5f7]">
              <TableHead className="text-xs font-semibold uppercase tracking-wide">
                Name
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide">
                Email
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide">
                Role
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide">
                Joined
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide text-right">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const isSelf = row.id === currentUserId;
              return (
                <TableRow key={row.id} className="hover:bg-[#f5f5f7]/40">
                  <TableCell className="font-medium text-sm">
                    {row.full_name || "—"}
                    {isSelf && (
                      <span className="ml-2 text-[10px] text-muted-foreground">
                        (you)
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.email}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className="text-[10px] px-2"
                      style={{
                        background:
                          row.role === "admin" ? "#e0f2fe" : "#f0fdf4",
                        color:
                          row.role === "admin" ? "#0369a1" : "#15803d",
                        border: "none",
                      }}
                    >
                      {row.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(row.created_at), "d MMM yyyy")}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={isSelf}
                      onClick={() => setTarget(row)}
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"
                    >
                      <Trash2 size={16} />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={target !== null} onOpenChange={(open) => !open && setTarget(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Delete user?</DialogTitle>
            <DialogDescription>
              This permanently removes{" "}
              <span className="font-semibold text-foreground">
                {target?.full_name || target?.email}
              </span>{" "}
              and all their attendance records. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setTarget(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete user"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
