import { useEffect, useState } from "react";
import { Field, Page, useAction } from "@/components/forms";
import { Card, Copy, RowLink } from "@/components/ui";
import { useAuth } from "@/data/auth-provider";
import { query, useResource } from "@/data/resources";
import { roleLabel } from "@/data/account";

type ViewableUser = { id: string; name: string | null; email: string; role: string };
export default function ViewAs() {
  const { user, viewingAs, viewAs } = useAuth();
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");
  const action = useAction();
  const allowed = user?.role === "SUPER_ADMIN" || !!viewingAs;
  const actorId = viewingAs?.originalId ?? user?.id;
  useEffect(() => {
    const timer = setTimeout(() => setApplied(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const resource = useResource<ViewableUser[]>(allowed ? `/api/admin/view-as/users?${query({ search: applied, limit: "30" })}` : null);
  const users = resource.data?.filter(account => account.id !== actorId);
  return <Page title="View as" {...resource}>
    {!allowed ? <Copy>Super Admin access is required.</Copy> : <>
      <Copy>See the portal with another user’s access. This session is read-only, and you can return to your account at any time.</Copy>
      <Field label="Search by name or email" value={search} onChange={setSearch} disabled={action.busy} />
      {users?.map(account => <Card key={account.id}><RowLink
        title={account.name ?? account.email}
        subtitle={`${account.email} · ${roleLabel(account.role)}`}
        onPress={() => { if (!action.busy) void action.run(async () => { await viewAs(account.id); }); }}
      /></Card>)}
      {!resource.loading && !resource.error && users?.length === 0 && <Copy>No matching accounts.</Copy>}
    </>}
  </Page>;
}
