import { useEffect, useRef, useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { Stack } from "expo-router";
import type { MakeupExamBooking, MakeupExamsResponse } from "@stmark/contracts";
import { Button, Copy, Icon, ListSurface, Screen, styles } from "@/components/ui";
import { ResourceState } from "@/components/forms";
import { feedback } from "@/data/haptics";
import { request, useResource } from "@/data/resources";
import { useAuth } from "@/data/auth-provider";
import { useChurchToday } from "@/data/use-liturgical";
import {
  MAKEUP_EXAMS_PATH,
  bookingFailure,
  bookingForExam,
  canCancel,
  checkBooking,
  dayLabel,
  examDetail,
  examTitle,
  groupEligible,
  isMakeupStudent,
  reconcileSelection,
  resultLabel,
  splitBookings,
  type Selection,
} from "@/data/makeup-exams";
import { MinistryTintProvider, useAppTheme } from "@/theme";

const OFFLINE = "Could not reach the server. Check your connection and try again.";

export default function MakeupExams() {
  return (
    <MinistryTintProvider ministry="prep">
      <MakeupExamsScreen />
    </MinistryTintProvider>
  );
}

function MakeupExamsScreen() {
  const { colors } = useAppTheme();
  const { user, viewingAs } = useAuth();
  const today = useChurchToday();
  const student = isMakeupStudent(user?.role);

  // The answer is about one student, so it is cached per signed-in (or viewed) account.
  const scope = user ? `makeup-exams:${viewingAs ? `${viewingAs.originalId}>` : ""}${user.id}` : undefined;
  const resource = useResource<MakeupExamsResponse>(student ? MAKEUP_EXAMS_PATH : null, scope);
  const data = resource.data;
  const offline = resource.error === OFFLINE;

  const [selection, setSelection] = useState<Selection>({ examId: "", friday: "" });
  const [busy, setBusy] = useState(false);

  // The Fridays on offer start the day after today in New York. When that day changes, ask again.
  const lastToday = useRef(today);
  useEffect(() => {
    if (lastToday.current === today) return;
    lastToday.current = today;
    if (student) void resource.refresh();
  }, [today, student, resource]);

  // Fresh data can take an exam off the list (it became passing) or a Friday out of the window; drop only those.
  useEffect(() => {
    if (!data) return;
    setSelection((current) => {
      const next = reconcileSelection(current, data);
      return next.examId === current.examId && next.friday === current.friday ? current : next;
    });
  }, [data]);

  const readOnly = !!viewingAs;
  const existing = data && selection.examId ? bookingForExam(selection.examId, data.bookings) : undefined;
  // One booking per exam: saving again moves it, even when the old Friday has passed.
  const existingPast = !!existing && !canCancel(existing, today);
  const { upcoming, past } = splitBookings(data?.bookings ?? [], today);

  // Results and refusals arrive as an alert: the person is usually scrolled down at the button, far from the top of the screen.
  const report = (tone: "ok" | "error", text: string) =>
    tone === "error" ? Alert.alert("Unable to complete", text) : Alert.alert(text);

  async function reloadAfter(failure: ReturnType<typeof bookingFailure>) {
    if (failure.reload) await resource.refresh();
  }

  async function save() {
    if (!data || busy || readOnly) return;
    const check = checkBooking(selection, data);
    if (!check.ok) return report("error", check.error);
    setBusy(true);
    try {
      await request(MAKEUP_EXAMS_PATH, "POST", check.body);
      feedback("success");
      report("ok", existing && !existingPast ? "Your makeup exam is rescheduled." : "Your makeup exam is scheduled.");
      setSelection({ examId: "", friday: "" });
      await resource.refresh();
    } catch (error) {
      feedback("error");
      const failure = bookingFailure(error);
      report("error", failure.message);
      await reloadAfter(failure);
    } finally {
      setBusy(false);
    }
  }

  function confirmCancel(booking: MakeupExamBooking) {
    if (busy || readOnly) return;
    Alert.alert(
      "Cancel this booking?",
      `${examTitle(booking.exam)} on ${dayLabel(booking.scheduledDate, "long")}. You can schedule it again while Fridays are available.`,
      [
        { text: "Keep booking", style: "cancel" },
        { text: "Cancel booking", style: "destructive", onPress: () => void cancel(booking) },
      ],
    );
  }
  async function cancel(booking: MakeupExamBooking) {
    setBusy(true);
    try {
      await request(MAKEUP_EXAMS_PATH, "DELETE", { id: booking.id });
      feedback("success");
      report("ok", "Booking cancelled.");
      await resource.refresh();
    } catch (error) {
      feedback("error");
      const failure = bookingFailure(error);
      report("error", failure.message);
      await reloadAfter(failure);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: "Makeup exams" }} />
      <Screen refreshing={resource.refreshing} onRefresh={() => void resource.refresh()}>
        {!student && (
          <View style={{ paddingVertical: 32, alignItems: "center", gap: 8 }}>
            <Copy kind="heading" style={{ textAlign: "center" }}>Not available for this account</Copy>
            <Copy kind="caption" style={{ textAlign: "center" }}>Makeup exams are scheduled by Servants Prep students.</Copy>
          </View>
        )}

        {student && (
          <>
            <Copy kind="caption">Choose a Friday and an exam you failed or missed. Your booking is confirmed when you save.</Copy>

            {readOnly && <Banner title="View only" text="Viewing as another account is read-only." />}

            {offline && resource.stale && (
              <Banner title="You're offline" text="Showing the last list we had. Pull down to try again once you're back online." warn />
            )}
            {!resource.stale && (
              <ResourceState loading={resource.loading} error={offline ? undefined : resource.error} retry={() => void resource.refresh()} />
            )}

            {data && (
              <>
                <Copy kind="heading">Schedule a makeup exam</Copy>
                {data.exams.length === 0 ? (
                  <Copy kind="caption">You have no failed or missed exams available to schedule.</Copy>
                ) : (
                  <View style={{ gap: 16 }}>
                    {groupEligible(data.exams).map((group) => (
                      <View key={group.reason} style={{ gap: 8 }}>
                        <Copy style={{ fontWeight: "600" }}>{group.title}</Copy>
                        {group.exams.map((exam) => {
                          const selected = selection.examId === exam.id;
                          const booked = bookingForExam(exam.id, data.bookings);
                          return (
                            <Pressable
                              key={exam.id}
                              accessibilityRole="radio"
                              accessibilityState={{ selected, disabled: busy || readOnly }}
                              accessibilityLabel={`${examTitle(exam)}. ${examDetail(exam)}. ${resultLabel(exam)}.${booked ? ` Booked for ${dayLabel(booked.scheduledDate)}.` : ""}`}
                              disabled={busy || readOnly}
                              onPress={() => setSelection((current) => ({ ...current, examId: selected ? "" : exam.id }))}
                              style={({ pressed }) => ({
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 12,
                                padding: 14,
                                borderRadius: 18,
                                borderWidth: selected ? 2 : 1,
                                borderColor: selected ? colors.primary : colors.border,
                                backgroundColor: pressed ? colors.hover : colors.surface,
                                opacity: readOnly ? 0.6 : 1,
                              })}
                            >
                              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                                <Copy style={{ fontWeight: "600" }}>{examTitle(exam)}</Copy>
                                <Copy kind="caption">{examDetail(exam)}</Copy>
                                <Copy kind="caption" color={exam.reason === "FAILED" ? colors.danger : colors.muted} style={{ fontWeight: "600" }}>
                                  {resultLabel(exam)}
                                </Copy>
                                {!!booked && <Copy kind="caption" color={colors.primary}>Booked for {dayLabel(booked.scheduledDate)}</Copy>}
                              </View>
                              <Icon
                                ios={selected ? "checkmark.circle.fill" : "circle"}
                                android={selected ? "check_circle" : "radio_button_unchecked"}
                                size={22}
                                color={selected ? colors.primary : colors.muted}
                              />
                            </Pressable>
                          );
                        })}
                      </View>
                    ))}

                    <View style={{ gap: 8 }}>
                      <Copy style={{ fontWeight: "600" }}>Choose a Friday</Copy>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                        {data.fridays.map((friday) => {
                          const selected = selection.friday === friday;
                          return (
                            <Pressable
                              key={friday}
                              accessibilityRole="radio"
                              accessibilityState={{ selected, disabled: busy || readOnly }}
                              accessibilityLabel={dayLabel(friday, "long")}
                              disabled={busy || readOnly}
                              onPress={() => setSelection((current) => ({ ...current, friday: selected ? "" : friday }))}
                              style={({ pressed }) => [
                                styles.pill,
                                {
                                  minHeight: 44,
                                  paddingHorizontal: 14,
                                  borderWidth: 1,
                                  borderColor: selected ? colors.primary : colors.border,
                                  backgroundColor: selected ? colors.primary : pressed ? colors.hover : colors.surface,
                                  opacity: readOnly ? 0.6 : 1,
                                },
                              ]}
                            >
                              <Copy color={selected ? colors.onAction : colors.text} style={{ fontWeight: "600" }}>
                                {dayLabel(friday).replace(/, \d{4}$/, "")}
                              </Copy>
                            </Pressable>
                          );
                        })}
                      </View>
                      <Copy kind="caption">
                        {existing
                          ? existingPast
                            ? `This exam was booked for ${dayLabel(existing.scheduledDate)}, which has passed. Saving books a new Friday and replaces that booking.`
                            : `Currently booked for ${dayLabel(existing.scheduledDate)}. Choose a new Friday to reschedule.`
                          : "Available dates cover the next 12 weeks. To reschedule, select the same exam and a new Friday."}
                      </Copy>
                    </View>

                    <Button
                      label={busy ? "Saving…" : existing && !existingPast ? "Reschedule makeup exam" : "Schedule makeup exam"}
                      disabled={busy || readOnly || !selection.examId || !selection.friday}
                      onPress={() => void save()}
                    />
                  </View>
                )}

                <Copy kind="heading">Your bookings</Copy>
                {data.bookings.length === 0 && <Copy kind="caption">No makeup exams scheduled.</Copy>}
                {upcoming.length > 0 && (
                  <View style={{ gap: 8 }}>
                    <Copy style={{ fontWeight: "600" }}>Upcoming</Copy>
                    <ListSurface>
                      {upcoming.map((booking, index) => (
                        <BookingRow
                          key={booking.id}
                          booking={booking}
                          divider={index < upcoming.length - 1}
                          action={
                            canCancel(booking, today) && !readOnly ? (
                              <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={`Cancel booking, ${examTitle(booking.exam)}, ${dayLabel(booking.scheduledDate)}`}
                                disabled={busy}
                                onPress={() => confirmCancel(booking)}
                                style={{ minHeight: 44, justifyContent: "center", opacity: busy ? 0.4 : 1 }}
                              >
                                <Copy color={colors.danger} style={{ fontWeight: "600" }}>Cancel booking</Copy>
                              </Pressable>
                            ) : null
                          }
                        />
                      ))}
                    </ListSurface>
                  </View>
                )}
                {past.length > 0 && (
                  <View style={{ gap: 8 }}>
                    <Copy style={{ fontWeight: "600" }}>Past</Copy>
                    <ListSurface>
                      {past.map((booking, index) => (
                        <BookingRow key={booking.id} booking={booking} divider={index < past.length - 1} past />
                      ))}
                    </ListSurface>
                  </View>
                )}
              </>
            )}
          </>
        )}
      </Screen>
    </>
  );
}

function BookingRow({ booking, divider, past = false, action }: { booking: MakeupExamBooking; divider: boolean; past?: boolean; action?: React.ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <View
      accessible={!action}
      accessibilityLabel={action ? undefined : `${dayLabel(booking.scheduledDate, "long")}. ${examTitle(booking.exam)}. ${examDetail(booking.exam)}.${past ? " Past." : ""}`}
      style={[{ padding: 16, gap: 4 }, divider && { borderBottomWidth: 0.5, borderBottomColor: colors.border }, past && { opacity: 0.75 }]}
    >
      <Copy style={{ fontWeight: "600" }}>{dayLabel(booking.scheduledDate, "long")}</Copy>
      <Copy>{examTitle(booking.exam)}</Copy>
      <Copy kind="caption">{examDetail(booking.exam)}</Copy>
      {action}
    </View>
  );
}

function Banner({ title, text, warn = false }: { title: string; text: string; warn?: boolean }) {
  const { colors } = useAppTheme();
  return (
    <View accessibilityLiveRegion="polite" style={{ padding: 14, borderRadius: 18, backgroundColor: warn ? colors.warningSoft : colors.hover, gap: 2 }}>
      <Copy style={{ fontWeight: "600" }} color={warn ? colors.warning : undefined}>{title}</Copy>
      <Copy kind="caption">{text}</Copy>
    </View>
  );
}
