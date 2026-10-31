import { useState } from "react";
import { Button, Card, Copy } from "@/components/ui";
import { Field, Page, useAction } from "@/components/forms";
import { request, useResource } from "@/data/resources";
import { useAuth } from "@/data/auth-provider";
import type { Person } from "@/data/people";

// Password changes have their own screen (/change-password), reached from
// My Account's own "Change password" row, matching the dedicated
// iOS · Change password artboard rather than being bundled in here.
export default function Profile() {
  const { user } = useAuth();
  const resource = useResource<Person>(user ? `/api/users/${encodeURIComponent(user.id)}` : null);
  return <Page title="Name" {...resource}>
    {resource.data && <ProfileEditor key={resource.data.updatedAt ?? resource.data.id} person={resource.data} refresh={resource.refresh} />}
  </Page>;
}
function ProfileEditor({ person, refresh }: { person: Person; refresh: () => Promise<void> }) {
  const [name, setName] = useState(person.name);
  const [phone, setPhone] = useState(person.phone ?? "");
  const [email, setEmail] = useState(person.email);
  const [currentPassword, setPassword] = useState("");
  const action = useAction();
  const changedEmail = email.trim().toLowerCase() !== person.email.toLowerCase();
  return <Card><Copy kind="heading">Your profile</Copy><Field label="Name" value={name} onChange={setName} disabled={action.busy} />
    <Field label="Email" keyboardType="email-address" value={email} onChange={setEmail} disabled={action.busy} />
    <Field label="Phone" keyboardType="phone-pad" value={phone} onChange={setPhone} disabled={action.busy} />
    {changedEmail && <Field label="Current password to confirm email change" value={currentPassword} onChange={setPassword} secureTextEntry disabled={action.busy} />}
    <Button label="Save profile" disabled={action.busy || !name.trim() || !email.trim() || (changedEmail && !currentPassword)} onPress={() => void action.run(async () => {
      await request(`/api/users/${encodeURIComponent(person.id)}`, "PATCH", { name, email: email.trim().toLowerCase(), phone, ...(changedEmail ? { currentPassword } : {}) }); setPassword(""); await refresh();
    }, "Profile saved")} />
  </Card>;
}
