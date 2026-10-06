import { describe, expect, it } from "vitest";
import {
  FOLDER_MIME,
  fileSubtitle,
  formatDate,
  formatSize,
  imagePreviewUri,
  isFolder,
  isImage,
  mimeLabel,
  regularSectionTitle,
  searchFiles,
  sortByRecent,
  splitFolders,
  type DriveFile,
} from "../../apps/mobile/src/data/prep-files";

const file = (overrides: Partial<DriveFile>): DriveFile => ({
  id: "f1",
  name: "Lesson 1 slides.pdf",
  mimeType: "application/pdf",
  webViewLink: "https://drive.google.com/file/d/f1/view",
  modifiedTime: "2026-09-26T10:00:00.000Z",
  size: "3251200",
  ...overrides,
});

describe("Files library (SMM-42)", () => {
  describe("happy path", () => {
    it("splits a mixed listing into folders and regular files", () => {
      const rows = [
        file({ id: "a", mimeType: FOLDER_MIME, name: "Lesson recordings" }),
        file({ id: "b", name: "handbook.pdf" }),
      ];
      const { folders, regular } = splitFolders(rows);
      expect(folders.map((f) => f.id)).toEqual(["a"]);
      expect(regular.map((f) => f.id)).toEqual(["b"]);
    });

    it("formats the row subtitle as Type · size · date, matching the design source", () => {
      expect(fileSubtitle(file({}))).toBe("PDF · 3.1 MB · Sep 26");
      expect(mimeLabel("video/mp4")).toBe("Video");
      expect(mimeLabel("image/heic")).toBe("Image");
      expect(formatSize("412000000")).toBe("392.9 MB");
      expect(formatDate("2026-09-01T12:00:00.000Z")).toBe("Sep 1");
    });

    it("sorts by most-recently-modified first", () => {
      const rows = [
        file({ id: "old", modifiedTime: "2026-09-01T00:00:00.000Z" }),
        file({ id: "new", modifiedTime: "2026-09-26T00:00:00.000Z" }),
      ];
      expect(sortByRecent(rows).map((f) => f.id)).toEqual(["new", "old"]);
    });

    it("filters by name case-insensitively, client-side (the real API has no search param)", () => {
      const rows = [file({ id: "a", name: "Program handbook.pdf" }), file({ id: "b", name: "Exam guide.pdf" })];
      expect(searchFiles(rows, "handbook").map((f) => f.id)).toEqual(["a"]);
      expect(searchFiles(rows, "")).toHaveLength(2);
    });

    it("labels the regular-files section 'Recent' only when folders are also present, else 'Files'", () => {
      expect(regularSectionTitle(true)).toBe("Recent");
      expect(regularSectionTitle(false)).toBe("Files");
    });

    it("identifies directly-previewable images and builds Drive's public direct-view URL", () => {
      expect(isImage("image/jpeg")).toBe(true);
      expect(isImage("application/pdf")).toBe(false);
      expect(imagePreviewUri("abc123")).toBe("https://drive.google.com/uc?export=view&id=abc123");
    });
  });

  describe("highest-risk path", () => {
    it("never misclassifies a folder as previewable content or vice versa", () => {
      expect(isFolder(FOLDER_MIME)).toBe(true);
      expect(isFolder("application/pdf")).toBe(false);
      expect(isImage(FOLDER_MIME)).toBe(false);
    });

    it("handles missing size/date gracefully instead of rendering 'undefined' or crashing", () => {
      expect(formatSize(undefined)).toBe("");
      expect(formatDate(undefined)).toBe("");
      expect(fileSubtitle(file({ size: undefined, modifiedTime: undefined }))).toBe("PDF");
    });
  });
});
