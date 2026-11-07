import { useRef, useState } from "react";
import { Alert } from "react-native";
import type { DigitalExamStaffRequest } from "@stmark/contracts";
import { request } from "./resources";
import { feedback } from "./haptics";
import { digitalExamPath } from "./live-exams";
import { ACTION_SUCCESS, staffActionFailure } from "./exam-monitor";

/**
 * Sends one staff action at a time to the existing POST /api/digital-exams/:id and always re-reads the dashboard afterwards, win or
 * lose, so the screen shows what the server actually holds. A refused action (stale unlock, an existing grade in the way, lost
 * permission) shows the server's own reason; nothing is retried automatically, and nothing is computed or published on the device.
 */
export function useExamStaffActions(examId: string, reload: () => Promise<void> | void, enabled: boolean) {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  async function run(body: DigitalExamStaffRequest, after?: () => void) {
    if (!enabled || lock.current) return false;
    lock.current = true;
    setBusy(true);
    try {
      await request(digitalExamPath(examId), "POST", body);
      feedback("success");
      after?.();
      await reload();
      Alert.alert(ACTION_SUCCESS[body.action]);
      return true;
    } catch (error) {
      feedback("error");
      const failure = staffActionFailure(error, body.action);
      Alert.alert("Not done", failure.message);
      if (failure.refresh) await Promise.resolve(reload()).catch(() => {});
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return { busy, run };
}
