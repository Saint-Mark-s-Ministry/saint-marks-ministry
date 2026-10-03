import { useState } from "react";
import { Button, Card, Copy } from "@/components/ui";
import { Field, Page, Toggle, confirmAction, useAction } from "@/components/forms";
import { request, useResource } from "@/data/resources";
import { useAuth } from "@/data/auth-provider";

type AcademicYear = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
};

const ACADEMIC_YEARS_PATH = "/api/academic-years";
const ADMIN_LIKE_ROLES = ["SUPER_ADMIN", "PRIEST", "SERVANT_PREP"];

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(value).getTime());
}

export default function AcademicYears() {
  const { user } = useAuth();
  const resource = useResource<AcademicYear[]>(ACADEMIC_YEARS_PATH);
  const [editor, setEditor] = useState<AcademicYear | "new" | null>(null);
  const action = useAction();
  const canManage = !!user && ADMIN_LIKE_ROLES.includes(user.role);
  const years = [...(resource.data ?? [])].sort((a, b) => b.startDate.localeCompare(a.startDate));
  return (
    <Page title="Academic years" {...resource}>
      <Copy kind="caption">Dashboards show the active year by default.</Copy>
      {canManage && <Button label="New academic year" onPress={() => setEditor("new")} />}
      {editor && canManage && (
        <YearEditor
          key={editor === "new" ? "new" : editor.id}
          year={editor === "new" ? undefined : editor}
          cancel={() => setEditor(null)}
          done={async () => {
            setEditor(null);
            await resource.refresh();
          }}
        />
      )}
      {resource.data && !years.length && <Copy>No academic years configured.</Copy>}
      {years.map((year) => (
        <Card key={year.id}>
          <Copy kind="heading">{year.name}</Copy>
          <Copy kind="caption">
            {year.startDate.slice(0, 10)} – {year.endDate.slice(0, 10)}
            {year.isActive ? " · Active" : ""}
          </Copy>
          {canManage && (
            <>
              <Button secondary label="Edit" onPress={() => setEditor(year)} />
              {!year.isActive && (
                <Button
                  secondary
                  label="Set as active year"
                  disabled={action.busy}
                  onPress={() =>
                    confirmAction(
                      "Set active year?",
                      `${year.name} will become the default year on dashboards.`,
                      () =>
                        void action.run(async () => {
                          await request(`${ACADEMIC_YEARS_PATH}/${year.id}`, "PATCH", { isActive: true });
                          await resource.refresh();
                        }),
                    )
                  }
                />
              )}
              <Button
                secondary
                label="Delete academic year"
                disabled={action.busy}
                onPress={() =>
                  confirmAction(
                    "Delete academic year permanently?",
                    "Lessons and exams recorded under this year are not removed, but this cannot be undone.",
                    () =>
                      void action.run(async () => {
                        await request(`${ACADEMIC_YEARS_PATH}/${year.id}`, "DELETE");
                        await resource.refresh();
                      }),
                    true,
                  )
                }
              />
            </>
          )}
        </Card>
      ))}
    </Page>
  );
}

function YearEditor({
  year,
  done,
  cancel,
}: {
  year?: AcademicYear;
  done: () => Promise<void>;
  cancel: () => void;
}) {
  const [name, setName] = useState(year?.name ?? "");
  const [startDate, setStartDate] = useState(year?.startDate.slice(0, 10) ?? "");
  const [endDate, setEndDate] = useState(year?.endDate.slice(0, 10) ?? "");
  const [active, setActive] = useState(year?.isActive ?? false);
  const action = useAction();
  const valid = name.trim() && validDate(startDate) && validDate(endDate) && startDate < endDate;
  return (
    <Card>
      <Field label="Name" value={name} onChange={setName} disabled={action.busy} />
      <Field label="Start date (YYYY-MM-DD)" value={startDate} onChange={setStartDate} disabled={action.busy} />
      <Field label="End date (YYYY-MM-DD)" value={endDate} onChange={setEndDate} disabled={action.busy} />
      <Toggle label="Active year" value={active} onChange={setActive} disabled={action.busy} />
      <Button
        label={action.busy ? "Saving…" : "Save academic year"}
        disabled={action.busy || !valid}
        onPress={() =>
          void action.run(async () => {
            await request(
              year ? `${ACADEMIC_YEARS_PATH}/${year.id}` : ACADEMIC_YEARS_PATH,
              year ? "PATCH" : "POST",
              { name, startDate, endDate, isActive: active },
            );
            await done();
          })
        }
      />
      <Button secondary label="Cancel" disabled={action.busy} onPress={cancel} />
    </Card>
  );
}
