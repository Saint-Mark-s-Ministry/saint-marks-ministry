import { useState } from "react";
import { Alert, Modal, Platform, Pressable, View } from "react-native";
import { DateTimePicker } from "@expo/ui/community/datetime-picker";
import { Button, Copy, Icon, styles } from "@/components/ui";
import { Choice, Field, ResourceState, Toggle, useAction } from "@/components/forms";
import { request, useResource } from "@/data/resources";
import { useAppTheme } from "@/theme";
import { formIsDirty, validateLessonForm, type LessonFormValues } from "@/data/prep-curriculum";

type AcademicYear = { id: string; name: string; isActive: boolean };
type ExamSection = { id: string; displayName: string };

export type LessonFormInitial = {
  id?: string;
  title: string;
  subtitle: string;
  examSectionId: string;
  scheduledDate: Date;
  speaker: string;
  isExamDay: boolean;
  description: string;
};

export function LessonFormSheet({
  initial,
  speakerSuggestions,
  onClose,
  onSaved,
}: {
  initial: LessonFormInitial;
  speakerSuggestions: string[];
  onClose: () => void;
  onSaved: (lessonId: string) => void;
}) {
  const { colors } = useAppTheme();
  const isEdit = !!initial.id;
  const years = useResource<AcademicYear[]>("/api/academic-years");
  const sections = useResource<ExamSection[]>("/api/exam-sections");
  const activeYear = years.data?.find((y) => y.isActive) ?? years.data?.[0];

  const [values, setValues] = useState<LessonFormValues>({
    title: initial.title,
    subtitle: initial.subtitle,
    examSectionId: initial.examSectionId,
    scheduledDate: initial.scheduledDate,
    speaker: initial.speaker,
    isExamDay: initial.isExamDay,
    description: initial.description,
  });
  const [showSuggestions, setShowSuggestions] = useState(false);
  const action = useAction();
  const dirty = formIsDirty(
    {
      title: initial.title,
      subtitle: initial.subtitle,
      examSectionId: initial.examSectionId,
      scheduledDate: initial.scheduledDate,
      speaker: initial.speaker,
      isExamDay: initial.isExamDay,
      description: initial.description,
    },
    values,
  );

  function requestClose() {
    if (!dirty) {
      onClose();
      return;
    }
    Alert.alert("Discard changes?", "You have unsaved changes to this lesson.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: onClose },
    ]);
  }

  function submit() {
    const error = validateLessonForm(values);
    if (error) {
      Alert.alert("Can't save yet", error);
      return;
    }
    if (!activeYear) {
      Alert.alert("No academic year", "Set up an academic year before adding lessons.");
      return;
    }
    void action.run(async () => {
      const body = {
        academicYearId: activeYear.id,
        examSectionId: values.examSectionId,
        title: values.title.trim(),
        subtitle: values.subtitle.trim() || undefined,
        description: values.description.trim() || undefined,
        scheduledDate: values.scheduledDate.toISOString(),
        speaker: values.speaker.trim() || undefined,
        isExamDay: values.isExamDay,
      };
      const saved = isEdit
        ? await request<{ id: string }>(`/api/lessons/${encodeURIComponent(initial.id!)}`, "PATCH", body)
        : await request<{ id: string }>("/api/lessons", "POST", body);
      onSaved(saved.id);
    });
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={requestClose}>
      <View style={{ flex: 1, backgroundColor: colors.background, padding: 20, paddingTop: 24, gap: 14 }}>
        <View style={[styles.row, { justifyContent: "space-between" }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            disabled={action.busy}
            onPress={requestClose}
            style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.hover }}
          >
            <Icon ios="xmark" android="close" size={18} />
          </Pressable>
          <Copy style={{ fontSize: 17, fontWeight: "600" }}>{isEdit ? "Edit lesson" : "New lesson"}</Copy>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isEdit ? "Save lesson" : "Create lesson"}
            disabled={action.busy}
            onPress={submit}
            style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary }}
          >
            <Icon ios="checkmark" android="check" size={18} color="#FFFFFF" />
          </Pressable>
        </View>

        <ResourceState loading={years.loading || sections.loading} error={years.error || sections.error} retry={() => { void years.refresh(); void sections.refresh(); }} />

        <Field label="Topic" value={values.title} onChange={(v) => setValues((s) => ({ ...s, title: v }))} placeholder="Topic title" disabled={action.busy} />
        <Field label="Subtitle" value={values.subtitle} onChange={(v) => setValues((s) => ({ ...s, subtitle: v }))} placeholder="Optional" disabled={action.busy} />

        <View style={{ gap: 7 }}>
          <Copy kind="caption">Date and time</Copy>
          <DateTimePicker
            value={values.scheduledDate}
            mode="datetime"
            display={Platform.OS === "ios" ? "compact" : "default"}
            onValueChange={(_, date) => setValues((s) => ({ ...s, scheduledDate: date }))}
            accentColor={colors.primary}
          />
        </View>

        {!!sections.data && (
          <Choice
            label="Section"
            value={values.examSectionId}
            options={sections.data.map((s) => ({ value: s.id, label: s.displayName }))}
            onChange={(v) => setValues((s) => ({ ...s, examSectionId: v }))}
            disabled={action.busy}
          />
        )}

        <View style={{ gap: 7 }}>
          <Field
            label="Speaker"
            value={values.speaker}
            onChange={(v) => {
              setValues((s) => ({ ...s, speaker: v }));
              setShowSuggestions(true);
            }}
            placeholder="Speaker name"
            disabled={action.busy}
          />
          {showSuggestions && !!values.speaker && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {speakerSuggestions
                .filter((name) => name.toLowerCase().includes(values.speaker.trim().toLowerCase()) && name !== values.speaker)
                .slice(0, 4)
                .map((name) => (
                  <Pressable
                    key={name}
                    accessibilityRole="button"
                    onPress={() => {
                      setValues((s) => ({ ...s, speaker: name }));
                      setShowSuggestions(false);
                    }}
                    style={{ paddingHorizontal: 12, height: 30, borderRadius: 15, backgroundColor: colors.hover, alignItems: "center", justifyContent: "center" }}
                  >
                    <Copy kind="caption">{name}</Copy>
                  </Pressable>
                ))}
            </View>
          )}
        </View>

        <Toggle label="Exam day" value={values.isExamDay} onChange={(v) => setValues((s) => ({ ...s, isExamDay: v }))} disabled={action.busy} />
        <Field
          label="Description"
          value={values.description}
          onChange={(v) => setValues((s) => ({ ...s, description: v }))}
          placeholder="Optional"
          multiline
          disabled={action.busy}
        />

        <Button label={action.busy ? "Saving…" : isEdit ? "Save lesson" : "Create lesson"} disabled={action.busy} onPress={submit} />
      </View>
    </Modal>
  );
}
