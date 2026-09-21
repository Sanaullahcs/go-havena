# Feature 3 — Resource Hub (Wellness & Learning)

**Information Value · Priority P0 (MVP) · Platforms: iOS, Android, Admin Dashboard · Dependencies: Auth, Community Membership**

## Purpose

Deliver **wellness and educational content** through structured courses, organized by the **W‑E‑L‑L‑S** framework. Some content is **HSA‑eligible**, adding monetary value.

## W‑E‑L‑L‑S pillars

| Pillar | Focus |
|--------|-------|
| 🍎 W — Weight & Diet | Nutrition, meal plans |
| 🏃 E — Exercise | Workouts, yoga |
| 🧘 L — Lowering Stress | Meditation, sleep |
| 📖 L — Learning | Skills, growth |
| 🤝 S — Social | Relationships |

## User stories (13)

US‑3.1 – US‑3.13: Browse pillars; view a course; view lessons in a course; play lesson video; track lesson completion; resume where left off; mark course complete; view progress/achievements tie‑in; favorite content; search wellness content; see HSA‑eligible badge; download/offline (future); rate a lesson.

## Data model

```text
ResourceCategory (pillar)
├── id (PK)
├── key: enum(weight, exercise, stress, learning, social)
├── title / description / icon

Course
├── id (PK)
├── category_id (FK)
├── title / summary / cover_url
├── is_hsa_eligible: boolean
└── status: enum(published, draft)

Lesson
├── id (PK)
├── course_id (FK)
├── title
├── content_type: enum(video, article)
├── media_url / body
├── duration_seconds
└── order: int

LessonProgress
├── id (PK)
├── user_id (FK)
├── lesson_id (FK)
├── status: enum(in_progress, completed)
├── progress_percent: int
└── completed_at: timestamp (nullable)
```

## API endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/wellness/categories` | List W‑E‑L‑L‑S pillars |
| GET | `/api/v1/wellness/categories/{key}/courses` | Courses in a pillar |
| GET | `/api/v1/wellness/courses/{id}` | Course + lessons |
| GET | `/api/v1/wellness/lessons/{id}` | Lesson detail (signed media URL) |
| POST | `/api/v1/wellness/lessons/{id}/progress` | Save progress / mark complete |
| GET | `/api/v1/wellness/me/progress` | My progress across courses |

## Permission matrix

| Action | Resident | Moderator | Admin |
|--------|:--------:|:---------:|:-----:|
| Browse & consume content | ✓ | ✓ | ✓ |
| Track personal progress | ✓ | ✓ | ✓ |
| Create / edit courses & lessons | ✗ | ✗ | ✓ |

## Screens

Wellness Hub (pillar grid) → Weight and Diet (pillar detail) → Balanced Nutrition Basics (lessons) → Balanced Nutrition Basics – Video. Video uses `expo-av`; progress bar via `react-native-progress`.

## Acceptance criteria

- Video playback resumes from last position; completion awards points (see Gamification).
- HSA‑eligible courses display the HSA badge.
- Content is read‑only for residents; authored via Admin Dashboard.
