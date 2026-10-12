import { useState } from "react";
import { Button, Card, Copy } from "@/components/ui";
import { Choice, Field, Page } from "@/components/forms";
import { query, useResource } from "@/data/resources";
import { useAuth } from "@/data/auth-provider";
import { MinistryTintProvider } from "@/theme";

type Audit = { events: { id: string; action: string; result: string; createdAt: string; entityType: string; actor: { name: string; email: string } | null; target?: { name: string } | null; reason: string | null }[]; page: number; total: number; totalPages: number };
export default function Activity() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");
  const [result, setResult] = useState("");
  const [page, setPage] = useState(1);
  const resource = useResource<Audit>(user?.role === "SUPER_ADMIN" ? `/api/admin/audit-log?${query({ page: String(page), search: applied, result })}` : null);
  return <MinistryTintProvider ministry="sundaySchool"><Page title="Activity" {...resource}>
    {user?.role !== "SUPER_ADMIN" ? <Copy>Super-admin access is required.</Copy> : <>
      <Field label="Search activity" value={search} onChange={setSearch} /><Button secondary label="Search" onPress={() => { setPage(1); setApplied(search.trim()); }} />
      <Choice label="Result" value={result} onChange={v => { setPage(1); setResult(v); }} options={[{ value: "", label: "All results" }, ...["SUCCESS", "DENIED", "FAILED"].map(value => ({ value, label: value }))]} />
      {resource.data?.events.map(e => <Card key={e.id}><Copy>{e.action}</Copy><Copy kind="caption">{new Date(e.createdAt).toLocaleString()} · {e.result}</Copy><Copy>{e.actor?.name ?? "System"}{e.target ? ` → ${e.target.name}` : ""}</Copy><Copy kind="caption">{e.entityType}{e.reason ? ` · ${e.reason}` : ""}</Copy></Card>)}
      {resource.data && <><Copy>{resource.data.total} events · Page {page} of {resource.data.totalPages}</Copy><Button secondary label="Previous page" disabled={page === 1} onPress={() => setPage(p => p - 1)} /><Button secondary label="Next page" disabled={page >= resource.data.totalPages} onPress={() => setPage(p => p + 1)} /></>}
    </>}
  </Page></MinistryTintProvider>;
}
