import { useCallback, useRef, useState } from "react";
import { Linking } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import { ApiError } from "./api-client";
import { api } from "./auth-provider";
import { invalidateResourceCache } from "./resources";
import {
  CAMERA_BLOCKED,
  CAMERA_NEEDED,
  CAMERA_UNAVAILABLE,
  PHOTO_REMOVED,
  PHOTO_SAVED,
  REMOVE_FAILURE,
  childPhotoPath,
  isCameraUnavailable,
  photoFailure,
  photoFailureMessage,
  resolvePhotoMimeType,
  validateChildPhoto,
  type PhotoTarget,
} from "./child-photo";

export interface PhotoNotice {
  kind: "error" | "info" | "permission";
  message: string;
  /** Whether Settings can fix it (camera access was refused for good). */
  canOpenSettings?: boolean;
  /** Whether the library is offered as the way around it. */
  target?: PhotoTarget;
}

/** The temporary picker file is the only local copy; delete it once it has been used or abandoned. */
function discard(uri: string | undefined) {
  if (!uri) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // The system clears its cache folder anyway.
  }
}

/**
 * Taking, choosing and removing a child's photo. The camera permission is asked for
 * only when someone taps Take photo; the system camera is presented in-process and
 * releases the camera when it closes. Cancelling anywhere leaves the saved photo
 * as it was. Upload goes to the existing child-photo route, and `onChanged` runs
 * after the server confirms so the roster or profile reads the new photo.
 */
export function useChildPhotos(onChanged: () => Promise<unknown> | void) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<PhotoNotice | null>(null);
  const inFlight = useRef(false);

  const upload = useCallback(
    async (target: PhotoTarget, asset: ImagePicker.ImagePickerAsset) => {
      if (!api) return;
      try {
        const picked = await fetch(asset.uri);
        const blob = await picked.blob();
        // The picker's size can be missing; judge the bytes we will actually send.
        const mimeType = resolvePhotoMimeType(asset.mimeType ?? blob.type, asset.fileName);
        const problem = validateChildPhoto({ mimeType, size: blob.size });
        if (problem) {
          setNotice({ kind: "error", message: problem, target });
          return;
        }
        const body = new FormData();
        (body as unknown as { append: (key: string, value: Blob, name?: string) => void }).append(
          "file",
          new Blob([blob], { type: mimeType }),
          mimeType === "image/png" ? "child-photo.png" : mimeType === "image/webp" ? "child-photo.webp" : "child-photo.jpg",
        );
        await api.request(childPhotoPath(target.id), { method: "POST", body });
        invalidateResourceCache();
        await Promise.resolve(onChanged()).catch(() => undefined);
        setNotice({ kind: "info", message: PHOTO_SAVED });
      } catch (error) {
        const failure = photoFailure(error instanceof ApiError ? error.status : undefined);
        setNotice({
          kind: "error",
          message: photoFailureMessage(failure, error instanceof ApiError ? error.message : undefined),
          target,
        });
        if (failure === "denied" || failure === "gone") await Promise.resolve(onChanged()).catch(() => undefined);
      } finally {
        discard(asset.uri);
      }
    },
    [onChanged],
  );

  const run = useCallback(async (target: PhotoTarget, task: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusyId(target.id);
    setNotice(null);
    try {
      await task();
    } finally {
      inFlight.current = false;
      setBusyId(null);
    }
  }, []);

  const takePhoto = useCallback(
    (target: PhotoTarget) =>
      run(target, async () => {
        // Asked only now, only for this action.
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setNotice({
            kind: "permission",
            message: permission.canAskAgain === false ? CAMERA_BLOCKED : CAMERA_NEEDED,
            canOpenSettings: permission.canAskAgain === false,
            target,
          });
          return;
        }
        let result: ImagePicker.ImagePickerResult;
        try {
          result = await ImagePicker.launchCameraAsync({
            mediaTypes: ["images"],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.7,
            cameraType: ImagePicker.CameraType.back,
          });
        } catch (error) {
          setNotice(
            isCameraUnavailable(error)
              ? { kind: "permission", message: CAMERA_UNAVAILABLE, target }
              : { kind: "error", message: "The camera couldn't open. Try again, or choose a photo from your library.", target },
          );
          return;
        }
        if (result.canceled || !result.assets[0]) return;
        await upload(target, result.assets[0]);
      }),
    [run, upload],
  );

  const choosePhoto = useCallback(
    (target: PhotoTarget) =>
      run(target, async () => {
        // The system photo picker shows only what the person selects; no library permission is needed.
        let result: ImagePicker.ImagePickerResult;
        try {
          result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.7,
            preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
          });
        } catch {
          setNotice({ kind: "error", message: "Your photo library couldn't open. Try again.", target });
          return;
        }
        if (result.canceled || !result.assets[0]) return;
        await upload(target, result.assets[0]);
      }),
    [run, upload],
  );

  const removePhoto = useCallback(
    (target: PhotoTarget) =>
      run(target, async () => {
        if (!api) return;
        try {
          await api.request(childPhotoPath(target.id), { method: "DELETE" });
          invalidateResourceCache();
          await Promise.resolve(onChanged()).catch(() => undefined);
          setNotice({ kind: "info", message: PHOTO_REMOVED });
        } catch (error) {
          const failure = photoFailure(error instanceof ApiError ? error.status : undefined);
          setNotice({
            kind: "error",
            message: failure === "retry" ? REMOVE_FAILURE : photoFailureMessage(failure),
            target,
          });
          if (failure === "denied" || failure === "gone") await Promise.resolve(onChanged()).catch(() => undefined);
        }
      }),
    [run, onChanged],
  );

  return {
    busyId,
    notice,
    dismiss: () => setNotice(null),
    openSettings: () => void Linking.openSettings(),
    takePhoto,
    choosePhoto,
    removePhoto,
  };
}
