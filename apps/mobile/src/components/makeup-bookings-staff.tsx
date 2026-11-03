import { View } from "react-native";
import type { MakeupExamBooking, MakeupExamsResponse } from "@stmark/contracts";
import { Copy, ListSurface } from "@/components/ui";
import { ResourceState } from "@/components/forms";
import { useAuth } from "@/data/auth-provider";
import { useChurchToday } from "@/data/use-liturgical";
import { useResource } from "@/data/resources";
import {
  MAKEUP_EXAMS_PATH,
  canViewMakeupBookings,
  dayLabel,
  examDetail,
  examTitle,
  staffBookings,
} from "@/data/makeup-exams";
import { useAppTheme } from "@/theme";

const OFFLINE = "Could not reach the server. Check your connection and try again.";

/**
 * The makeup exam bookings on the staff Exams screen: every student's booking, ordered by Friday, with the student's name and
 * email. Rendered only for the accounts the API lets read it (administrators, priests, Servants Prep servants). It is a
 * list and nothing else: no times, places, capacity or approval.
 */
export function MakeupBookingsStaff() {
  const { colors } = useAppTheme();
  const { user, viewingAs } = useAuth();
  const today = useChurchToday();
  const allowed = canViewMakeupBookings(user?.role);
  const scope = user ? `makeup-exams:${viewingAs ? `${viewingAs.originalId}>` : ""}${user.id}` : undefined;
  const resource = useResource<MakeupExamsResponse>(allowed ? MAKEUP_EXAMS_PATH : null, scope);
  if (!allowed) return null;
  const offline = resource.error === OFFLINE;
  const { upcoming, past } = staffBookings(resource.data?.bookings ?? [], today);

  return (
    <View style={{ gap: 10 }}>
      <Copy style={{ fontSize: 17, fontWeight: "600" }}>Makeup exam bookings</Copy>
      <Copy kind="caption">Student bookings, ordered by Friday.</Copy>
      {offline && resource.stale && (
        <View accessibilityLiveRegion="polite" style={{ padding: 14, borderRadius: 18, backgroundColor: colors.warningSoft, gap: 2 }}>
          <Copy style={{ fontWeight: "600" }} color={colors.warning}>You're offline</Copy>
          <Copy kind="caption">Showing the last list we had. Pull down to try again once you're back online.</Copy>
        </View>
      )}
      {!resource.stale && (
        <ResourceState loading={resource.loading} error={offline ? undefined : resource.error} retry={() => void resource.refresh()} />
      )}
      {resource.data && resource.data.bookings.length === 0 && <Copy kind="caption">No makeup exams scheduled.</Copy>}
      <BookingGroup title="Upcoming" bookings={upcoming} />
      <BookingGroup title="Past" bookings={past} past />
    </View>
  );
}

function BookingGroup({ title, bookings, past = false }: { title: string; bookings: MakeupExamBooking[]; past?: boolean }) {
  const { colors } = useAppTheme();
  if (!bookings.length) return null;
  return (
    <View style={{ gap: 8 }}>
      <Copy style={{ fontWeight: "600" }}>{title}</Copy>
      <ListSurface>
        {bookings.map((booking, index) => (
          <View
            key={booking.id}
            accessible
            accessibilityLabel={`${dayLabel(booking.scheduledDate, "long")}. ${booking.student?.name ?? "Student"}. ${examTitle(booking.exam)}. ${examDetail(booking.exam)}.`}
            style={[{ padding: 16, gap: 4 }, index < bookings.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: colors.border }, past && { opacity: 0.75 }]}
          >
            <Copy style={{ fontWeight: "600" }}>{dayLabel(booking.scheduledDate, "long")}</Copy>
            <Copy>{examTitle(booking.exam)}</Copy>
            <Copy kind="caption">{examDetail(booking.exam)}</Copy>
            {!!booking.student && <Copy kind="caption">{booking.student.name} · {booking.student.email}</Copy>}
          </View>
        ))}
      </ListSurface>
    </View>
  );
}
