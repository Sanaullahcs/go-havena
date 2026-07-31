import type { FieldErrors } from "@/lib/admin/form-validation-utils";

function isValidHttpUrl(url: string): boolean {
  if (!url.trim()) return false;
  try {
    const u = new URL(url.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function validateWellnessCategoryForm(form: {
  title: string;
  color?: string;
}): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.title.trim()) {
    errors.title = "Category title is required.";
  }
  if (form.color?.trim() && !/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(form.color.trim())) {
    errors.color = "Use a valid hex color (e.g. #0052DF).";
  }
  return errors;
}

export function validateWellnessCourseForm(form: {
  title: string;
  description: string;
  category_id?: number | null;
}): FieldErrors {
  const errors: FieldErrors = {};

  if (!form.category_id) {
    errors.category_id = "Select a category.";
  }

  if (!form.title.trim()) {
    errors.title = "Course title is required.";
  }

  if (!form.description.trim()) {
    errors.description = "Course description is required.";
  }

  return errors;
}

/**
 * Lesson must have a title and at least one content source:
 * a new/kept file OR a valid link.
 */
export function validateWellnessLessonForm(form: {
  title: string;
  link_url?: string;
  course_id?: number | null;
  hasFile?: boolean;
  keepExistingFile?: boolean;
  keepExistingLink?: boolean;
}): FieldErrors {
  const errors: FieldErrors = {};

  if ("course_id" in form && !form.course_id) {
    errors.course_id = "Select a course.";
  }

  if (!form.title.trim()) {
    errors.title = "Lesson title is required.";
  }

  const link = (form.link_url ?? "").trim();
  if (link && !isValidHttpUrl(link)) {
    errors.link_url = "Enter a valid http(s) link.";
  }

  const finalHasFile = Boolean(form.hasFile) || Boolean(form.keepExistingFile);
  const finalHasLink = link ? isValidHttpUrl(link) : false;

  if (!finalHasFile && !finalHasLink) {
    errors.content = "Provide a file upload or a link.";
  }

  return errors;
}

export function validateWellnessCourseEdit(form: { title: string; description: string }): FieldErrors {
  const errors: FieldErrors = {};

  if (!form.title.trim()) {
    errors.title = "Course title is required.";
  }

  if (!form.description.trim()) {
    errors.description = "Course description is required.";
  }

  return errors;
}

export function validateWellnessLessonEdit(
  form: {
    title: string;
    link_url?: string;
    hasFile?: boolean;
    keepExistingFile?: boolean;
  },
): FieldErrors {
  return validateWellnessLessonForm(form);
}
