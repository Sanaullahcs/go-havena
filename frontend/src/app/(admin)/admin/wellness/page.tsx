"use client";

import { ClearableInput, ClearableTextarea } from "@/components/admin/clearable-field";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  GraduationCap,
  LayoutGrid,
  Plus,
  Search,
  X,
  Check,
  ChevronRight,
  Link2,
  FileUp,
} from "lucide-react";
import { AdminBadge, StatTile } from "@/components/admin/ui";
import { AdminActionsMenu } from "@/components/admin/admin-actions-menu";
import { WellnessCourseFormModal } from "@/components/admin/wellness-course-form-modal";
import { WellnessLessonFormModal } from "@/components/admin/wellness-lesson-form-modal";
import { CategoryImageField, cleanTakeaways, KeyTakeawaysEditor } from "@/components/admin/wellness-form-fields";
import { ThemedSelect } from "@/components/ui/themed-select";
import { confirmDelete, toastError, toastSuccess } from "@/lib/alert";
import { apiError } from "@/lib/api/client";
import { PageError, PageLoader } from "@/components/shared/page-states";
import { TableLoadingOverlay, TableProgressBar } from "@/components/shared/loaders";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { isAdminSearchPending } from "@/lib/admin/table-loading";
import {
  createWellnessCategory,
  createWellnessCourse,
  createWellnessLesson,
  deleteWellnessCategory,
  deleteWellnessCourse,
  deleteWellnessLesson,
  fetchWellnessCategories,
  fetchWellnessCourses,
  fetchWellnessLessons,
  updateWellnessCategory,
  updateWellnessCourse,
  updateWellnessLesson,
  uploadWellnessCategoryImage,
  uploadWellnessCourseImage,
  type WellnessCategory,
  type WellnessCourse,
  type WellnessLesson,
} from "@/lib/api/admin-wellness";
import { useTouchedFieldErrors } from "@/hooks/use-touched-field-errors";
import {
  validateWellnessCategoryForm,
  validateWellnessCourseEdit,
  validateWellnessLessonForm,
} from "@/lib/admin/wellness-form-validation";
import { hasFieldErrors, inputClass } from "@/lib/admin/form-validation-utils";

const emptyCategory = {
  title: "",
  subtitle: "",
  color: "#1B4F8A",
  status: "active" as WellnessCategory["status"],
  imageFile: null as File | null,
  imagePreview: null as string | null,
};

type CourseEdit = {
  id: number;
  title: string;
  description: string;
  status: WellnessCourse["status"];
  imageFile: File | null;
  imageUrl: string | null;
  imagePreview: string | null;
  removeImage: boolean;
};

type LessonEdit = {
  id: number;
  title: string;
  description: string;
  link_url: string;
  key_takeaways: string[];
  status: WellnessLesson["status"];
  file: File | null;
  file_url: string | null;
  remove_file: boolean;
  has_file: boolean;
};

type CategoryEdit = {
  id: number;
  title: string;
  subtitle: string;
  color: string;
  status: WellnessCategory["status"];
  imageFile: File | null;
  imageUrl: string | null;
  imagePreview: string | null;
  removeImage: boolean;
};

export default function AdminWellnessPage() {
  const [categories, setCategories] = useState<WellnessCategory[]>([]);
  const [courses, setCourses] = useState<WellnessCourse[]>([]);
  const [lessons, setLessons] = useState<WellnessLesson[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [lessonsLoading, setLessonsLoading] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, 400);
  const isSearchPending = isAdminSearchPending(searchInput, debouncedSearch);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [courseModalOpen, setCourseModalOpen] = useState(false);
  const [lessonModalOpen, setLessonModalOpen] = useState(false);
  const [lessonModalCourses, setLessonModalCourses] = useState<WellnessCourse[]>([]);
  const [lessonCoursesLoading, setLessonCoursesLoading] = useState(false);

  const [categoryForm, setCategoryForm] = useState(emptyCategory);

  const categoryValidation = useTouchedFieldErrors();

  const [editingCategory, setEditingCategory] = useState<CategoryEdit | null>(null);
  const [editingCourse, setEditingCourse] = useState<CourseEdit | null>(null);
  const [editingLesson, setEditingLesson] = useState<LessonEdit | null>(null);

  const skipCatId = useRef<number | null>(null);

  const categoryLiveErrors = useMemo(
    () => validateWellnessCategoryForm(categoryForm),
    [categoryForm],
  );

  const editingLessonLiveErrors = useMemo(() => {
    if (!editingLesson) return {};
    return validateWellnessLessonForm({
      title: editingLesson.title,
      link_url: editingLesson.link_url,
      hasFile: Boolean(editingLesson.file),
      keepExistingFile: editingLesson.has_file && !editingLesson.remove_file,
    });
  }, [editingLesson]);

  const canCreateCategory = !hasFieldErrors(categoryLiveErrors);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cats = await fetchWellnessCategories();
        if (cancelled) return;
        setCategories(cats);
        const firstCatId = cats[0]?.id ?? null;
        skipCatId.current = firstCatId;
        setSelectedCategoryId(firstCatId);
        if (firstCatId) {
          const crs = await fetchWellnessCourses({ category_id: firstCatId });
          if (cancelled) return;
          setCourses(crs);
          const firstCourseId = crs[0]?.id ?? null;
          setSelectedCourseId(firstCourseId);
        }
      } catch (err) {
        if (!cancelled) setPageError(apiError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (selectedCategoryId === null) {
      setCourses([]);
      return;
    }
    if (skipCatId.current === selectedCategoryId) {
      skipCatId.current = null;
      return;
    }
    let cancelled = false;
    (async () => {
      setCoursesLoading(true);
      try {
        const params: { category_id: number; search?: string } = {
          category_id: selectedCategoryId,
        };
        if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
        const data = await fetchWellnessCourses(params);
        if (cancelled) return;
        setCourses(data);
        setEditingCourse(null);
        setEditingLesson(null);
        if (selectedCourseId && data.some((c) => c.id === selectedCourseId)) return;
        setSelectedCourseId(data[0]?.id ?? null);
      } catch (err) {
        toastError(apiError(err));
      } finally {
        if (!cancelled) setCoursesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedCategoryId, debouncedSearch]);

  useEffect(() => {
    if (selectedCourseId === null) {
      setLessons([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLessonsLoading(true);
      try {
        const data = await fetchWellnessLessons(selectedCourseId);
        if (!cancelled) setLessons(data);
      } catch (err) {
        if (!cancelled) toastError(apiError(err));
      } finally {
        if (!cancelled) setLessonsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedCourseId]);

  useEffect(() => {
    if (!lessonModalOpen) return;
    let cancelled = false;
    (async () => {
      setLessonCoursesLoading(true);
      try {
        const data = await fetchWellnessCourses();
        if (!cancelled) setLessonModalCourses(data);
      } catch (err) {
        if (!cancelled) toastError(apiError(err));
      } finally {
        if (!cancelled) setLessonCoursesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lessonModalOpen]);

  const refreshCategories = async () => {
    const d = await fetchWellnessCategories();
    setCategories(d);
    return d;
  };

  const refreshCourses = async (catId = selectedCategoryId, search = debouncedSearch) => {
    if (!catId) {
      setCourses([]);
      return [] as WellnessCourse[];
    }
    const params: { category_id: number; search?: string } = { category_id: catId };
    if (search.trim()) params.search = search.trim();
    const d = await fetchWellnessCourses(params);
    setCourses(d);
    return d;
  };

  const refreshLessons = async (courseId = selectedCourseId) => {
    if (!courseId) {
      setLessons([]);
      return;
    }
    const d = await fetchWellnessLessons(courseId);
    setLessons(d);
  };

  const handleCreateCategory = async () => {
    if (!categoryValidation.validateOnSubmit(categoryLiveErrors)) return;
    setSubmitting(true);
    try {
      let imageUrl: string | undefined;
      if (categoryForm.imageFile) {
        imageUrl = await uploadWellnessCategoryImage(categoryForm.imageFile);
      }
      const created = await createWellnessCategory({
        title: categoryForm.title.trim(),
        subtitle: categoryForm.subtitle.trim() || undefined,
        color: categoryForm.color.trim() || "#1B4F8A",
        status: categoryForm.status,
        image_url: imageUrl,
      });
      toastSuccess("Category created");
      if (categoryForm.imagePreview?.startsWith("blob:")) {
        URL.revokeObjectURL(categoryForm.imagePreview);
      }
      setCategoryForm(emptyCategory);
      setShowCategoryForm(false);
      categoryValidation.resetTouched();
      const cats = await refreshCategories();
      skipCatId.current = created.id;
      setSelectedCategoryId(created.id);
      if (!cats.some((c) => c.id === created.id)) {
        /* refreshed */
      }
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveCategory = async () => {
    if (!editingCategory) return;
    const errors = validateWellnessCategoryForm(editingCategory);
    if (hasFieldErrors(errors)) {
      toastError(errors.title || errors.color || "Fix category fields.");
      return;
    }
    setSubmitting(true);
    try {
      let imageUrl = editingCategory.imageUrl;
      if (editingCategory.imageFile) {
        imageUrl = await uploadWellnessCategoryImage(editingCategory.imageFile);
      } else if (editingCategory.removeImage) {
        imageUrl = null;
      }
      await updateWellnessCategory(editingCategory.id, {
        title: editingCategory.title.trim(),
        subtitle: editingCategory.subtitle.trim() || undefined,
        color: editingCategory.color.trim() || "#1B4F8A",
        status: editingCategory.status,
        image_url: imageUrl,
      });
      toastSuccess("Category updated");
      if (editingCategory.imagePreview?.startsWith("blob:")) {
        URL.revokeObjectURL(editingCategory.imagePreview);
      }
      setEditingCategory(null);
      await refreshCategories();
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteCategory = async (cat: WellnessCategory) => {
    const ok = await confirmDelete({
      title: "Delete category?",
      text: cat.course_count
        ? "This category still has courses. Remove them first."
        : `Delete “${cat.title}”?`,
    });
    if (!ok) return;
    if (cat.course_count > 0) {
      toastError("Remove or move all courses before deleting this category.");
      return;
    }
    try {
      await deleteWellnessCategory(cat.id);
      toastSuccess("Category deleted");
      const cats = await refreshCategories();
      if (selectedCategoryId === cat.id) {
        const next = cats[0]?.id ?? null;
        skipCatId.current = next;
        setSelectedCategoryId(next);
      }
    } catch (err) {
      toastError(apiError(err));
    }
  };

  const handleCreateCourse = async (form: {
    category_id: number | null;
    title: string;
    description: string;
    status: WellnessCourse["status"];
    imageFile?: File | null;
    imagePreview?: string | null;
  }) => {
    if (!form.category_id) return;
    setSubmitting(true);
    try {
      let imageUrl: string | undefined;
      if (form.imageFile) {
        imageUrl = await uploadWellnessCourseImage(form.imageFile);
      }
      const created = await createWellnessCourse({
        category_id: form.category_id,
        title: form.title,
        description: form.description,
        status: form.status,
        image_url: imageUrl,
      });
      if (form.imagePreview?.startsWith("blob:")) URL.revokeObjectURL(form.imagePreview);
      toastSuccess("Course created");
      setCourseModalOpen(false);
      skipCatId.current = form.category_id;
      setSelectedCategoryId(form.category_id);
      await refreshCourses(form.category_id);
      await refreshCategories();
      setSelectedCourseId(created.id);
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveCourse = async () => {
    if (!editingCourse) return;
    const errors = validateWellnessCourseEdit(editingCourse);
    if (hasFieldErrors(errors)) {
      toastError(errors.title || errors.description || "Fix course fields.");
      return;
    }
    setSubmitting(true);
    try {
      let imageUrl = editingCourse.imageUrl;
      if (editingCourse.imageFile) {
        imageUrl = await uploadWellnessCourseImage(editingCourse.imageFile);
      } else if (editingCourse.removeImage) {
        imageUrl = null;
      }
      await updateWellnessCourse(editingCourse.id, {
        title: editingCourse.title.trim(),
        description: editingCourse.description.trim(),
        status: editingCourse.status,
        image_url: imageUrl,
      });
      if (editingCourse.imagePreview?.startsWith("blob:")) {
        URL.revokeObjectURL(editingCourse.imagePreview);
      }
      toastSuccess("Course updated");
      setEditingCourse(null);
      await refreshCourses();
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteCourse = async (course: WellnessCourse) => {
    const ok = await confirmDelete({ title: "Delete course?", text: `Delete “${course.title}”?` });
    if (!ok) return;
    try {
      await deleteWellnessCourse(course.id);
      toastSuccess("Course deleted");
      const remaining = await refreshCourses();
      await refreshCategories();
      setSelectedCourseId(remaining[0]?.id ?? null);
    } catch (err) {
      toastError(apiError(err));
    }
  };

  const handleToggleCourseStatus = async (course: WellnessCourse) => {
    const nextStatus = course.status === "published" ? "draft" : "published";
    try {
      await updateWellnessCourse(course.id, { status: nextStatus });
      setCourses((prev) =>
        prev.map((item) => (item.id === course.id ? { ...item, status: nextStatus } : item)),
      );
      toastSuccess(nextStatus === "published" ? "Course published" : "Course unpublished");
      await refreshCourses();
      await refreshCategories();
    } catch (err) {
      toastError(apiError(err));
    }
  };

  const handleCreateLesson = async (form: {
    course_id: number | null;
    title: string;
    description: string;
    link_url: string;
    key_takeaways: string[];
    status: WellnessLesson["status"];
    file: File | null;
  }) => {
    if (!form.course_id) return;
    setSubmitting(true);
    try {
      await createWellnessLesson(form.course_id, {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        duration_min: 10,
        link_url: form.link_url.trim() || null,
        key_takeaways: cleanTakeaways(form.key_takeaways),
        status: form.status,
        file: form.file,
      });
      toastSuccess("Lesson created");
      setLessonModalOpen(false);
      const targetCourse =
        lessonModalCourses.find((c) => c.id === form.course_id) ??
        courses.find((c) => c.id === form.course_id);
      if (targetCourse) {
        skipCatId.current = targetCourse.category_id;
        setSelectedCategoryId(targetCourse.category_id);
        await refreshCourses(targetCourse.category_id);
        setSelectedCourseId(targetCourse.id);
      }
      await refreshLessons(form.course_id);
      await refreshCategories();
      if (targetCourse) {
        await refreshCourses(targetCourse.category_id);
      }
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveLesson = async () => {
    if (!editingLesson) return;
    if (hasFieldErrors(editingLessonLiveErrors)) {
      toastError(
        editingLessonLiveErrors.title ||
          editingLessonLiveErrors.link_url ||
          editingLessonLiveErrors.content ||
          "Fix lesson fields.",
      );
      return;
    }
    setSubmitting(true);
    try {
      await updateWellnessLesson(editingLesson.id, {
        title: editingLesson.title.trim(),
        description: editingLesson.description.trim() || "",
        link_url: editingLesson.link_url.trim() || null,
        key_takeaways: cleanTakeaways(editingLesson.key_takeaways),
        status: editingLesson.status,
        file: editingLesson.file,
        remove_file: editingLesson.remove_file,
      });
      toastSuccess("Lesson updated");
      setEditingLesson(null);
      await refreshLessons();
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteLesson = async (lesson: WellnessLesson) => {
    const ok = await confirmDelete({ title: "Delete lesson?", text: `Delete “${lesson.title}”?` });
    if (!ok) return;
    try {
      await deleteWellnessLesson(lesson.id);
      toastSuccess("Lesson deleted");
      await refreshLessons();
      await refreshCategories();
      await refreshCourses();
    } catch (err) {
      toastError(apiError(err));
    }
  };

  const handleToggleLessonStatus = async (lesson: WellnessLesson) => {
    const nextStatus = lesson.status === "published" ? "draft" : "published";
    try {
      await updateWellnessLesson(lesson.id, {
        title: lesson.title,
        status: nextStatus,
      });
      setLessons((prev) =>
        prev.map((item) => (item.id === lesson.id ? { ...item, status: nextStatus } : item)),
      );
      toastSuccess(nextStatus === "published" ? "Lesson published" : "Lesson unpublished");
      await refreshLessons();
      await refreshCourses();
      await refreshCategories();
    } catch (err) {
      toastError(apiError(err));
    }
  };

  const selectedCourse = courses.find((c) => c.id === selectedCourseId) ?? null;
  const totalLessons = categories.reduce((sum, c) => sum + c.lesson_count, 0);

  const retry = () => {
    setPageError(null);
    skipCatId.current = null;
    setSelectedCategoryId(null);
    setSelectedCourseId(null);
    setLoading(true);
    (async () => {
      try {
        const cats = await fetchWellnessCategories();
        setCategories(cats);
        const firstCatId = cats[0]?.id ?? null;
        skipCatId.current = firstCatId;
        setSelectedCategoryId(firstCatId);
        if (firstCatId) {
          const crs = await fetchWellnessCourses({ category_id: firstCatId });
          setCourses(crs);
          setSelectedCourseId(crs[0]?.id ?? null);
        }
      } catch (err) {
        setPageError(apiError(err));
      } finally {
        setLoading(false);
      }
    })();
  };

  if (loading) return <PageLoader skeleton />;
  if (pageError) return <PageError message={pageError} onRetry={retry} />;

  return (
    <div className="space-y-6">
      <div>
        <p className="nl-eyebrow">Platform</p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Wellness Programs</h2>
        <p className="mt-1 text-sm text-slate-500">
          Manage categories, courses, and lessons. Course descriptions are required. Lessons need a file or a link.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Categories"
          value={String(categories.length)}
          hint="Active wellness pillars"
          tone="cyan"
          icon={<LayoutGrid className="h-5 w-5" />}
        />
        <StatTile
          label="Courses"
          value={String(courses.length)}
          hint="In selected category"
          tone="green"
          icon={<BookOpen className="h-5 w-5" />}
        />
        <StatTile
          label="Lessons"
          value={String(totalLessons)}
          hint="Across all categories"
          tone="amber"
          icon={<GraduationCap className="h-5 w-5" />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        {/* Categories */}
        <div className="rounded-2xl border border-slate-200 bg-white p-3">
          <div className="mb-2 flex items-center justify-between px-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Categories</p>
              <p className="text-xs text-slate-400">Add and manage pillars</p>
            </div>
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
              onClick={() => {
                setShowCategoryForm((v) => {
                  if (v && categoryForm.imagePreview?.startsWith("blob:")) {
                    URL.revokeObjectURL(categoryForm.imagePreview);
                    setCategoryForm(emptyCategory);
                  }
                  return !v;
                });
                setEditingCategory(null);
              }}
              title="Add category"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          {showCategoryForm ? (
            <div className="mb-3 space-y-2 rounded-xl border border-blue-200 bg-blue-50/40 p-3">
              <ClearableInput
                className={inputClass(categoryValidation.showError("title", categoryLiveErrors), "nl-input")}
                placeholder="Category title *"
                value={categoryForm.title}
                onChange={(e) => {
                  categoryValidation.clearError("title");
                  setCategoryForm((f) => ({ ...f, title: e.target.value }));
                }}
                onBlur={() => categoryValidation.touch("title")}
              />
              <ClearableInput
                className="nl-input"
                placeholder="Subtitle (optional)"
                value={categoryForm.subtitle}
                onChange={(e) => setCategoryForm((f) => ({ ...f, subtitle: e.target.value }))}
              />
              <ClearableInput
                className={inputClass(categoryValidation.showError("color", categoryLiveErrors), "nl-input")}
                placeholder="#1B4F8A"
                value={categoryForm.color}
                onChange={(e) => {
                  categoryValidation.clearError("color");
                  setCategoryForm((f) => ({ ...f, color: e.target.value }));
                }}
              />
              <CategoryImageField
                inputId="create-category-image"
                previewUrl={categoryForm.imagePreview}
                onPick={(file) => {
                  if (categoryForm.imagePreview?.startsWith("blob:")) {
                    URL.revokeObjectURL(categoryForm.imagePreview);
                  }
                  setCategoryForm((f) => ({
                    ...f,
                    imageFile: file,
                    imagePreview: URL.createObjectURL(file),
                  }));
                }}
                onRemove={() => {
                  if (categoryForm.imagePreview?.startsWith("blob:")) {
                    URL.revokeObjectURL(categoryForm.imagePreview);
                  }
                  setCategoryForm((f) => ({ ...f, imageFile: null, imagePreview: null }));
                }}
              />
              <button
                type="button"
                className="nl-btn-primary w-full disabled:opacity-60"
                disabled={submitting || !canCreateCategory}
                onClick={handleCreateCategory}
              >
                Add
              </button>
              {categoryValidation.showError("title", categoryLiveErrors) ? (
                <p className="text-xs text-red-600">{categoryValidation.showError("title", categoryLiveErrors)}</p>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-1">
            {categories.map((cat) => (
              <div key={cat.id} className="rounded-xl">
                {editingCategory?.id === cat.id ? (
                  <div className="space-y-2 border border-blue-300 bg-blue-50/30 p-3 rounded-xl">
                    <ClearableInput
                      className="nl-input"
                      value={editingCategory.title}
                      onChange={(e) => setEditingCategory((f) => (f ? { ...f, title: e.target.value } : f))}
                    />
                    <ClearableInput
                      className="nl-input"
                      value={editingCategory.subtitle}
                      placeholder="Subtitle"
                      onChange={(e) => setEditingCategory((f) => (f ? { ...f, subtitle: e.target.value } : f))}
                    />
                    <ClearableInput
                      className="nl-input"
                      value={editingCategory.color}
                      onChange={(e) => setEditingCategory((f) => (f ? { ...f, color: e.target.value } : f))}
                    />
                    <select
                      className="nl-input"
                      value={editingCategory.status}
                      onChange={(e) =>
                        setEditingCategory((f) =>
                          f ? { ...f, status: e.target.value as WellnessCategory["status"] } : f,
                        )
                      }
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                    <CategoryImageField
                      inputId={`edit-category-image-${editingCategory.id}`}
                      previewUrl={editingCategory.imagePreview}
                      onPick={(file) =>
                        setEditingCategory((f) => {
                          if (!f) return f;
                          if (f.imagePreview?.startsWith("blob:")) URL.revokeObjectURL(f.imagePreview);
                          return {
                            ...f,
                            imageFile: file,
                            imagePreview: URL.createObjectURL(file),
                            removeImage: false,
                          };
                        })
                      }
                      onRemove={() =>
                        setEditingCategory((f) => {
                          if (!f) return f;
                          if (f.imagePreview?.startsWith("blob:")) URL.revokeObjectURL(f.imagePreview);
                          return {
                            ...f,
                            imageFile: null,
                            imagePreview: null,
                            removeImage: true,
                          };
                        })
                      }
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        className="nl-btn-ghost text-xs"
                        onClick={() => {
                          if (editingCategory.imagePreview?.startsWith("blob:")) {
                            URL.revokeObjectURL(editingCategory.imagePreview);
                          }
                          setEditingCategory(null);
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="nl-btn-primary text-xs"
                        disabled={submitting}
                        onClick={handleSaveCategory}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    className={[
                      "flex w-full items-center gap-1 rounded-xl px-2 py-1.5 transition",
                      selectedCategoryId === cat.id ? "bg-blue-50" : "hover:bg-slate-50",
                    ].join(" ")}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCategoryId(cat.id);
                        setSelectedCourseId(null);
                        setEditingCourse(null);
                        setEditingLesson(null);
                      }}
                      className={[
                        "flex min-w-0 flex-1 items-center justify-between rounded-lg px-1 py-1 text-left text-sm",
                        selectedCategoryId === cat.id ? "font-semibold text-blue-700" : "text-slate-700",
                      ].join(" ")}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        {cat.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={cat.image_url}
                            alt=""
                            className="h-6 w-6 shrink-0 rounded-full object-cover"
                          />
                        ) : (
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: cat.color }}
                          />
                        )}
                        <ChevronRight
                          className={`h-3 w-3 shrink-0 transition-transform ${
                            selectedCategoryId === cat.id ? "rotate-90" : ""
                          }`}
                        />
                        <span className="truncate">{cat.title}</span>
                      </span>
                      <span className="ml-2 shrink-0 text-xs text-slate-400">{cat.course_count}</span>
                    </button>
                    <AdminActionsMenu
                      actions={[
                        {
                          label: "Edit category",
                          icon: "edit",
                          onClick: () =>
                            setEditingCategory({
                              id: cat.id,
                              title: cat.title,
                              subtitle: cat.subtitle ?? "",
                              color: cat.color,
                              status: cat.status,
                              imageFile: null,
                              imageUrl: cat.image_url,
                              imagePreview: cat.image_url,
                              removeImage: false,
                            }),
                        },
                        {
                          label: "Delete category",
                          icon: "delete",
                          tone: "danger",
                          onClick: () => handleDeleteCategory(cat),
                        },
                      ]}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {/* Courses */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-slate-900">
                Courses
                {selectedCategoryId ? (
                  <span className="ml-2 text-sm font-normal text-slate-400">
                    — {categories.find((c) => c.id === selectedCategoryId)?.title}
                  </span>
                ) : null}
              </h3>
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
                <div className="nl-search-field min-w-[12rem] flex-1 sm:max-w-xs">
                  <Search className="nl-search-icon" />
                  <ClearableInput
                    type="text"
                    className="nl-input w-full"
                    placeholder="Search courses…"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    disabled={!selectedCategoryId}
                  />
                </div>
                <button
                  type="button"
                  className="nl-btn-primary inline-flex items-center gap-1.5"
                  onClick={() => setCourseModalOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                  Add Course
                </button>
              </div>
            </div>

            <div className="relative max-h-[min(420px,50vh)] min-h-[8rem] overflow-y-auto pr-1">
              {coursesLoading ? <TableLoadingOverlay minHeight="8rem" /> : isSearchPending ? <TableProgressBar /> : null}
              <div className={coursesLoading ? "pointer-events-none select-none space-y-2 opacity-55" : "space-y-2"}>
              {courses.map((course) => (
                <div key={course.id}>
                  {editingCourse?.id !== course.id ? (
                    <div
                      onClick={() => {
                        setSelectedCourseId(course.id);
                        setEditingLesson(null);
                      }}
                      className={[
                        "cursor-pointer rounded-xl border p-3 transition",
                        selectedCourseId === course.id
                          ? "border-blue-300 bg-blue-50/40"
                          : "border-slate-200 hover:border-slate-300",
                      ].join(" ")}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-slate-900">{course.title}</p>
                          <p className="truncate text-xs text-slate-500">
                            {course.description || "No description"}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <AdminBadge tone={course.status === "published" ? "green" : "amber"}>
                            {course.status}
                          </AdminBadge>
                          <AdminActionsMenu
                            actions={[
                              {
                                label: "Edit course",
                                icon: "edit",
                                onClick: () =>
                                  setEditingCourse({
                                    id: course.id,
                                    title: course.title,
                                    description: course.description ?? "",
                                    status: course.status,
                                    imageFile: null,
                                    imageUrl: course.image_url ?? null,
                                    imagePreview: course.image_url ?? null,
                                    removeImage: false,
                                  }),
                              },
                              {
                                label: course.status === "published" ? "Unpublish" : "Publish",
                                icon: course.status === "published" ? "ban" : "approve",
                                tone: course.status === "published" ? "warning" : "success",
                                onClick: () => handleToggleCourseStatus(course),
                              },
                              {
                                label: "Delete course",
                                icon: "delete",
                                tone: "danger",
                                onClick: () => handleDeleteCourse(course),
                              },
                            ]}
                          />
                        </div>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">{course.lesson_count} lessons</p>
                    </div>
                  ) : (
                    <div className="space-y-2 rounded-xl border-2 border-blue-400 bg-blue-50/30 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Editing course</p>
                      <ClearableInput
                        className="nl-input"
                        placeholder="Course title *"
                        value={editingCourse.title}
                        onChange={(e) =>
                          setEditingCourse((f) => (f ? { ...f, title: e.target.value } : f))
                        }
                      />
                      <CategoryImageField
                        inputId={`edit-course-image-${editingCourse.id}`}
                        previewUrl={editingCourse.imagePreview}
                        onPick={(file) =>
                          setEditingCourse((f) => {
                            if (!f) return f;
                            if (f.imagePreview?.startsWith("blob:")) URL.revokeObjectURL(f.imagePreview);
                            return {
                              ...f,
                              imageFile: file,
                              imagePreview: URL.createObjectURL(file),
                              removeImage: false,
                            };
                          })
                        }
                        onRemove={() =>
                          setEditingCourse((f) => {
                            if (!f) return f;
                            if (f.imagePreview?.startsWith("blob:")) URL.revokeObjectURL(f.imagePreview);
                            return {
                              ...f,
                              imageFile: null,
                              imagePreview: null,
                              removeImage: true,
                            };
                          })
                        }
                      />
                      <ClearableTextarea
                        className="nl-input min-h-[72px]"
                        placeholder="Course description *"
                        value={editingCourse.description}
                        onChange={(e) =>
                          setEditingCourse((f) => (f ? { ...f, description: e.target.value } : f))
                        }
                      />
                      <ThemedSelect
                        value={editingCourse.status}
                        onChange={(value) =>
                          setEditingCourse((f) =>
                            f ? { ...f, status: value as WellnessCourse["status"] } : f,
                          )
                        }
                        options={[
                          { value: "published", label: "Published" },
                          { value: "draft", label: "Draft" },
                        ]}
                        placeholder="Status"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          className="nl-btn-ghost text-xs"
                          onClick={() => {
                            if (editingCourse.imagePreview?.startsWith("blob:")) {
                              URL.revokeObjectURL(editingCourse.imagePreview);
                            }
                            setEditingCourse(null);
                          }}
                        >
                          <X className="mr-1 inline h-3.5 w-3.5" /> Cancel
                        </button>
                        <button
                          type="button"
                          className="nl-btn-primary text-xs"
                          disabled={submitting}
                          onClick={handleSaveCourse}
                        >
                          <Check className="mr-1 inline h-3.5 w-3.5" /> Save
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {courses.length === 0 ? (
                <p className="text-sm text-slate-500">
                  {!selectedCategoryId
                    ? "Select a category to view courses."
                    : debouncedSearch.trim()
                      ? `No courses match "${debouncedSearch.trim()}".`
                      : "No courses yet — click Add Course to create one."}
                </p>
              ) : null}
              </div>
            </div>
          </div>

          {/* Lessons */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-slate-900">
                Lessons
                {selectedCourse ? (
                  <span className="ml-2 text-sm font-normal text-slate-400">— {selectedCourse.title}</span>
                ) : null}
              </h3>
              <button
                type="button"
                className="nl-btn-primary inline-flex items-center gap-1.5"
                onClick={() => setLessonModalOpen(true)}
              >
                <Plus className="h-4 w-4" />
                Add Lesson
              </button>
            </div>

            {selectedCourse ? (
              <>
                <div className="relative max-h-[min(420px,50vh)] min-h-[8rem] overflow-y-auto pr-1">
                  {lessonsLoading ? <TableLoadingOverlay minHeight="8rem" /> : null}
                  <div className={lessonsLoading ? "pointer-events-none select-none space-y-2 opacity-45" : "space-y-2"}>
                  {lessons.map((lesson, index) => (
                    <div key={lesson.id}>
                      {editingLesson?.id !== lesson.id ? (
                        <div className="rounded-xl border border-slate-200 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-slate-900">
                                {index + 1}. {lesson.title}
                              </p>
                              <p className="text-xs text-slate-500">
                                {lesson.duration_min} min
                                {lesson.has_link ? (
                                  <span className="ml-1 text-emerald-600">· Link</span>
                                ) : null}
                                {lesson.has_file ? (
                                  <span className="ml-1 text-emerald-600">· File</span>
                                ) : null}
                                {!lesson.has_link && !lesson.has_file ? (
                                  <span className="ml-1 text-rose-500">· No content</span>
                                ) : null}
                                {(lesson.key_takeaways?.length ?? 0) > 0 ? (
                                  <span className="ml-1 text-slate-400">
                                    · {lesson.key_takeaways.length} takeaways
                                  </span>
                                ) : null}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                              <AdminBadge tone={lesson.status === "published" ? "green" : "amber"}>
                                {lesson.status}
                              </AdminBadge>
                              <AdminActionsMenu
                                actions={[
                                  {
                                    label: "Edit lesson",
                                    icon: "edit",
                                    onClick: () =>
                                      setEditingLesson({
                                        id: lesson.id,
                                        title: lesson.title,
                                        description: lesson.description ?? "",
                                        link_url: lesson.link_url ?? lesson.video_url ?? "",
                                        key_takeaways: [...(lesson.key_takeaways ?? [])],
                                        status: lesson.status,
                                        file: null,
                                        file_url: lesson.file_url ?? null,
                                        remove_file: false,
                                        has_file: Boolean(lesson.has_file),
                                      }),
                                  },
                                  {
                                    label: lesson.status === "published" ? "Unpublish" : "Publish",
                                    icon: lesson.status === "published" ? "ban" : "approve",
                                    tone: lesson.status === "published" ? "warning" : "success",
                                    onClick: () => handleToggleLessonStatus(lesson),
                                  },
                                  {
                                    label: "Delete lesson",
                                    icon: "delete",
                                    tone: "danger",
                                    onClick: () => handleDeleteLesson(lesson),
                                  },
                                ]}
                              />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2 rounded-xl border-2 border-blue-400 bg-blue-50/30 p-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
                            Editing lesson {index + 1}
                          </p>
                          <ClearableInput
                            className="nl-input"
                            placeholder="Lesson title *"
                            value={editingLesson.title}
                            onChange={(e) =>
                              setEditingLesson((f) => (f ? { ...f, title: e.target.value } : f))
                            }
                          />

                          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                            <div className="rounded-xl border border-slate-200 bg-white p-3">
                              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
                                <Link2 className="h-4 w-4 text-blue-600" />
                                Link
                              </div>
                              <ClearableInput
                                className="nl-input w-full"
                                placeholder="https://… (video or resource link)"
                                value={editingLesson.link_url}
                                onChange={(e) =>
                                  setEditingLesson((f) => (f ? { ...f, link_url: e.target.value } : f))
                                }
                              />
                              <p className="mt-1 text-xs text-slate-400">
                                Optional if a file is uploaded or kept
                              </p>
                            </div>

                            <div className="rounded-xl border border-slate-200 bg-white p-3">
                              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
                                <FileUp className="h-4 w-4 text-blue-600" />
                                File upload
                              </div>
                              <ClearableInput
                                type="file"
                                className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100"
                                onChange={(e) =>
                                  setEditingLesson((f) =>
                                    f
                                      ? {
                                          ...f,
                                          file: e.target.files?.[0] ?? null,
                                          remove_file: false,
                                        }
                                      : f,
                                  )
                                }
                              />
                              {editingLesson.file ? (
                                <p className="mt-1 truncate text-xs text-emerald-600">
                                  New file: {editingLesson.file.name}
                                </p>
                              ) : editingLesson.has_file && !editingLesson.remove_file ? (
                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                  <p className="truncate text-xs text-emerald-600">Current file attached</p>
                                  {editingLesson.file_url ? (
                                    <a
                                      href={editingLesson.file_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-xs font-semibold text-blue-600 hover:underline"
                                    >
                                      View
                                    </a>
                                  ) : null}
                                  <button
                                    type="button"
                                    className="text-xs text-rose-600 hover:underline"
                                    onClick={() =>
                                      setEditingLesson((f) =>
                                        f ? { ...f, remove_file: true, file: null } : f,
                                      )
                                    }
                                  >
                                    Remove current file
                                  </button>
                                </div>
                              ) : editingLesson.remove_file ? (
                                <p className="mt-1 text-xs text-amber-600">Current file will be removed on save</p>
                              ) : (
                                <p className="mt-1 text-xs text-slate-400">
                                  Video, PDF, or document (max 50MB)
                                </p>
                              )}
                            </div>
                          </div>

                          <ClearableTextarea
                            className="nl-input min-h-[60px]"
                            placeholder="Description (optional)"
                            value={editingLesson.description}
                            onChange={(e) =>
                              setEditingLesson((f) => (f ? { ...f, description: e.target.value } : f))
                            }
                          />
                          <KeyTakeawaysEditor
                            value={editingLesson.key_takeaways}
                            onChange={(items) =>
                              setEditingLesson((f) => (f ? { ...f, key_takeaways: items } : f))
                            }
                          />
                          <ThemedSelect
                            value={editingLesson.status}
                            onChange={(value) =>
                              setEditingLesson((f) =>
                                f ? { ...f, status: value as WellnessLesson["status"] } : f,
                              )
                            }
                            options={[
                              { value: "published", label: "Published" },
                              { value: "draft", label: "Draft" },
                            ]}
                            placeholder="Status"
                          />
                          {hasFieldErrors(editingLessonLiveErrors) ? (
                            <p className="text-xs text-red-600">
                              {editingLessonLiveErrors.title ||
                                editingLessonLiveErrors.link_url ||
                                editingLessonLiveErrors.content}
                            </p>
                          ) : null}
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              className="nl-btn-ghost text-xs"
                              onClick={() => setEditingLesson(null)}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              className="nl-btn-primary text-xs"
                              disabled={submitting || hasFieldErrors(editingLessonLiveErrors)}
                              onClick={handleSaveLesson}
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  {lessons.length === 0 ? (
                    <p className="text-sm text-slate-500">No lessons yet — click Add Lesson to create one.</p>
                  ) : null}
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-500">
                {courses.length > 0
                  ? "Click a course above to manage its lessons."
                  : "Create a course first to add lessons."}
              </p>
            )}
          </div>
        </div>
      </div>

      <WellnessCourseFormModal
        open={courseModalOpen}
        submitting={submitting}
        categories={categories}
        defaultCategoryId={selectedCategoryId}
        onClose={() => setCourseModalOpen(false)}
        onSubmit={handleCreateCourse}
      />

      <WellnessLessonFormModal
        open={lessonModalOpen}
        submitting={submitting}
        courses={lessonModalCourses}
        coursesLoading={lessonCoursesLoading}
        defaultCourseId={selectedCourseId}
        onClose={() => setLessonModalOpen(false)}
        onSubmit={handleCreateLesson}
      />
    </div>
  );
}
