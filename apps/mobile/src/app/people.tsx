import { useState } from "react";
import { router } from "expo-router";
import { Button, Card, Copy, RowLink } from "@/components/ui";
import { Field, Page } from "@/components/forms";
import { query, useResource } from "@/data/resources";
import { useAuth } from "@/data/auth-provider";
import type { Person } from "@/data/people";
import { MinistryTintProvider } from "@/theme";

export default function People() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");
  const [page, setPage] = useState(1);
  const resource = useResource<{ data: Person[]; pagination: { total: number; totalPages: number } }>(user?.role === "SUPER_ADMIN" ? `/api/users?${query({ page: String(page), limit: "30", search: applied })}` : null);
  return <MinistryTintProvider ministry="sundaySchool"><Page title="People & organization" {...resource}>
    {user?.role !== "SUPER_ADMIN" ? <Copy>Super-admin access is required.</Copy> : <>
      <Button label="Add account" onPress={() => router.push({ pathname: "/person/[id]", params: { id: "new" } })} />
      <Button secondary label="Ministry organization" onPress={() => router.push("/organization")} />
      <Field label="Search by name, email, or phone" value={search} onChange={setSearch} /><Button secondary label="Search" onPress={() => { setPage(1); setApplied(search.trim()); }} />
      {resource.data?.data.map(p => <Card key={p.id}><RowLink title={p.name} subtitle={`${p.email} · ${p.role.replaceAll("_", " ")}${p.isDisabled ? " · Disabled" : ""}`} onPress={() => router.push({ pathname: "/person/[id]", params: { id: p.id, disabled: String(!!p.isDisabled) } })} /></Card>)}
      {resource.data && <><Copy>Page {page} · {resource.data.pagination.total} accounts</Copy><Button secondary label="Previous page" disabled={page === 1} onPress={() => setPage(p => p - 1)} /><Button secondary label="Next page" disabled={page >= resource.data.pagination.totalPages} onPress={() => setPage(p => p + 1)} /></>}
    </>}
  </Page></MinistryTintProvider>;
}
