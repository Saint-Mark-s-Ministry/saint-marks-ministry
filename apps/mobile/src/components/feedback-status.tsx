import type { SundaySchoolFeedbackStatus } from "@stmark/contracts";
import { StatusPill } from "@/components/ui";
import { statusLabel } from "@/data/sunday-school-feedback";
import { useAppTheme } from "@/theme";

export function FeedbackStatus({ status }: { status: SundaySchoolFeedbackStatus }) {
  const { colors } = useAppTheme();
  const tones = {
    OPEN: { color: colors.muted, soft: colors.hover },
    PLANNED: { color: colors.info, soft: colors.infoSoft },
    IN_PROGRESS: { color: colors.warning, soft: colors.warningSoft },
    COMPLETED: { color: colors.success, soft: colors.successSoft },
    DECLINED: { color: colors.danger, soft: colors.dangerSoft },
  };
  return <StatusPill label={statusLabel(status)} {...tones[status]} />;
}
