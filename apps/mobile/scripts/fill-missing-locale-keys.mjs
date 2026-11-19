/**
 * One-off gap fill: sets missing en/ar/es keys so language switches do not fall back to English UI.
 * Run from apps/mobile: node scripts/fill-missing-locale-keys.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..", "locales");

function setPath(obj, dotPath, value) {
  const parts = dotPath.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!cur[parts[i]] || typeof cur[parts[i]] !== "object") cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

function flat(obj, p = "") {
  const out = {};
  for (const k of Object.keys(obj || {})) {
    const pathKey = p ? `${p}.${k}` : k;
    if (obj[k] && typeof obj[k] === "object" && !Array.isArray(obj[k])) {
      Object.assign(out, flat(obj[k], pathKey));
    } else out[pathKey] = obj[k];
  }
  return out;
}

/** Arabic UI strings for keys present in en but missing in ar (excl. propertyMgmt). */
const AR = {
  "feed.createPost.createPoll": "إنشاء استطلاع",
  "feed.createPost.pollDetails": "تفاصيل الاستطلاع",
  "feed.createPost.pollOptionPlaceholder": "أدخل الخيار {{number}}",
  "feed.poll.badge": "استطلاع",
  "feed.poll.endsIn": "ينتهي الاستطلاع خلال {{time}}",
  "feed.poll.voteRecorded": "تم تسجيل صوتك",
  "auth.invalidOrExpiredCode": "رمز التحقق غير صالح أو منتهي الصلاحية.",
  "auth.codeNotSentYet": "اطلب رمز تحقق أولاً ثم حاول مرة أخرى.",
  "onboarding.utilityBillProof": "فاتورة مرافق (آخر 3 أشهر)",
  "onboarding.ownershipProof": "إثبات ملكية",
  "onboarding.tenancyProof": "إثبات إيجار / عقد",
  "onboarding.ownershipProofRequired": "إثبات الملكية مطلوب لهذه الوحدة.",
  "onboarding.tenancyProofRequired": "إثبات الإيجار / العقد مطلوب لهذه الوحدة.",
  "onboarding.duplicateUnit": "لا يمكن إضافة كل وحدة إلا مرة واحدة.",
  "admin.communityEvents": "فعاليات المجتمع",
  "admin.communityEventsSub": "عرض والانضمام لفعاليات المقيمين",
  "admin.tapEventToJoin": "اضغط للفتح — انضم أو غادر كالمقيمين",
  "admin.noPublishedEvents": "لا توجد فعاليات منشورة بعد.",
  "events.eventDetails": "تفاصيل الفعالية",
  "events.eventSchedule": "جدول الفعالية",
  "events.eventScheduleHint":
    "متى تبدأ الفعالية وتنتهي—وليس متى تظهر في التطبيق. تبقى ظاهرة حتى انتهاء تاريخ ووقت النهاية.",
  "events.startDate": "تبدأ في",
  "events.registrationDeadline": "آخر موعد للتسجيل",
  "events.registrationDeadlineHint":
    "يمكن للمقيمين الانضمام فقط قبل هذا التاريخ والوقت. تبقى الفعالية ظاهرة حتى انتهائها.",
  "events.registrationLastDate": "آخر تاريخ للتسجيل",
  "events.registrationLastTime": "آخر وقت للتسجيل",
  "events.registrationClosed": "التسجيل مغلق",
  "events.registrationClosedHint":
    "أُغلق التسجيل لهذه الفعالية. ما زال بإمكانك عرضها حتى انتهائها.",
  "events.selectTime": "اختر الوقت",
  "validation.publishScheduleAfterRegistration":
    "يجب أن يكون تاريخ ووقت النشر قبل موعد انتهاء التسجيل.",
  "validation.registrationDateRequired": "آخر تاريخ للتسجيل مطلوب.",
  "validation.registrationTimeRequired": "آخر وقت للتسجيل مطلوب.",
  "validation.registrationBeforeStart":
    "يجب أن يكون موعد انتهاء التسجيل قبل تاريخ ووقت بداية الفعالية.",
  "validation.fields.startDate": "تاريخ البداية",
  "billing.checkingStatus": "جارٍ التحقق من حالة الحساب…",
  "billing.setupRequired": "طريقة الدفع",
  "billing.completeSetupTitle": "أضف طريقة دفع",
  "billing.completeSetupBody":
    "احفظ بطاقة في بوابة إدارة Havena. سترى السعر الكامل للخطة أولاً — التجربة المجانية مشمولة، وأول خصم يكون بعد انتهائها.",
  "billing.waitingHint":
    "ابقَ في التطبيق. اضغط «تحديث الحالة» بعد الإشعار، أو اسحب للأسفل في أي وقت.",
  "billing.yourCommunity": "مجتمعك",
  "billing.reviewProgress": "التقدم",
  "billing.howItWorks": "الخطوات التالية",
  "billing.stepOpenWeb": "افتح صفحة الدفع الآمنة",
  "billing.stepChoosePlan": "أضف بطاقتك — التجربة مشمولة",
  "billing.stepReturn": "ارجع إلى هذه الشاشة",
  "billing.stepRefresh": "اضغط «تحديث الحالة»",
  "billing.setupLink": "رابط بوابة المطوّر",
  "billing.copyLink": "نسخ الرابط",
  "billing.urlCopied": "تم نسخ رابط بوابة الإدارة.",
  "billing.refreshHint":
    "ستضيف بيانات البطاقة في متصفح آمن ثم تعود هنا. لا يُخصم شيء حتى بعد الموافقة وانتهاء التجربة.",
  "billing.opening": "جارٍ الفتح…",
  "billing.openWebSetup": "المتابعة في المتصفح",
  "billing.iveFinished": "تحديث الحالة",
  "billing.cannotOpenBrowser":
    "تعذّر فتح بوابة الإدارة. حاول مرة أخرى أو استخدم متصفح سطح المكتب.",
  "amenities.types.other": "أخرى",
  "amenities.validation.customCategoryRequired": "أدخل اسم فئة مخصصة.",
  "pending.pendingUnitPackage":
    "تسجيل وحدتك قيد المراجعة. يمكنك استخدام التطبيق بعد موافقة المسؤول.",
  "topBar.discoverPlacesCount_one": "{{count}} مكان",
};

const ES = {
  "feed.createPost.createPoll": "Crear encuesta",
  "feed.createPost.pollDetails": "Detalles de la encuesta",
  "feed.createPost.pollOptionPlaceholder": "Introduce la opción {{number}}",
  "feed.poll.badge": "Encuesta",
  "feed.poll.endsIn": "La encuesta termina en {{time}}",
  "feed.poll.voteRecorded": "Tu voto se ha registrado",
  "auth.invalidOrExpiredCode": "Código de verificación no válido o caducado.",
  "auth.codeNotSentYet": "Solicita un código de verificación primero y vuelve a intentarlo.",
  "onboarding.utilityBillProof": "Factura de servicios (últimos 3 meses)",
  "onboarding.ownershipProof": "Comprobante de propiedad",
  "onboarding.tenancyProof": "Comprobante de arrendamiento",
  "onboarding.ownershipProofRequired": "Se requiere comprobante de propiedad para esta unidad.",
  "onboarding.tenancyProofRequired": "Se requiere comprobante de arrendamiento para esta unidad.",
  "onboarding.duplicateUnit": "Cada unidad solo puede añadirse una vez.",
  "admin.communityEvents": "Eventos de la comunidad",
  "admin.communityEventsSub": "Ver y unirte a eventos de residentes",
  "admin.tapEventToJoin": "Toca para abrir — únete o sal como los residentes",
  "admin.noPublishedEvents": "Aún no hay eventos publicados.",
  "events.eventDetails": "Detalles del evento",
  "events.eventSchedule": "Horario del evento",
  "events.eventScheduleHint":
    "Cuándo empieza y termina el evento, no cuándo aparece en la app. Sigue visible hasta que pase la fecha y hora de fin.",
  "events.startDate": "Empieza el",
  "events.registrationDeadline": "Fecha límite de inscripción",
  "events.registrationDeadlineHint":
    "Los residentes solo pueden unirse antes de esta fecha y hora. El evento sigue visible hasta que termine.",
  "events.registrationLastDate": "Última fecha de inscripción",
  "events.registrationLastTime": "Última hora de inscripción",
  "events.registrationClosed": "Inscripción cerrada",
  "events.registrationClosedHint":
    "La inscripción para este evento cerró. Aún puedes verlo hasta que termine.",
  "events.selectTime": "Seleccionar hora",
  "validation.publishScheduleAfterRegistration":
    "La fecha y hora de publicación deben ser anteriores al cierre de inscripción.",
  "validation.registrationDateRequired": "La última fecha de inscripción es obligatoria.",
  "validation.registrationTimeRequired": "La última hora de inscripción es obligatoria.",
  "validation.registrationBeforeStart":
    "El cierre de inscripción debe ser anterior al inicio del evento.",
  "validation.fields.startDate": "Fecha de inicio",
  "billing.checkingStatus": "Comprobando el estado de la cuenta…",
  "billing.setupRequired": "Método de pago",
  "billing.completeSetupTitle": "Añade un método de pago",
  "billing.completeSetupBody":
    "Guarda una tarjeta en el portal de administración de Havena. Verás primero el precio completo del plan; la prueba está incluida y el primer cargo es solo después de que termine.",
  "billing.waitingHint":
    "Permanece en la app. Toca Actualizar estado cuando te avisen, o desliza hacia abajo cuando quieras.",
  "billing.yourCommunity": "Tu comunidad",
  "billing.reviewProgress": "Progreso",
  "billing.howItWorks": "Próximos pasos",
  "billing.stepOpenWeb": "Abre la página de facturación segura",
  "billing.stepChoosePlan": "Añade tu tarjeta — prueba incluida",
  "billing.stepReturn": "Vuelve a esta pantalla",
  "billing.stepRefresh": "Toca Actualizar estado",
  "billing.setupLink": "Enlace del portal de desarrollador",
  "billing.copyLink": "Copiar enlace",
  "billing.urlCopied": "Enlace del portal copiado.",
  "billing.refreshHint":
    "Añadirás los datos de la tarjeta en un navegador seguro y volverás aquí. No se cobra nada hasta después de la aprobación y la prueba.",
  "billing.opening": "Abriendo…",
  "billing.openWebSetup": "Continuar en el navegador",
  "billing.iveFinished": "Actualizar estado",
  "billing.cannotOpenBrowser":
    "No se pudo abrir el portal de administración. Inténtalo de nuevo o usa un navegador de escritorio.",
  "amenities.types.other": "Otro",
  "amenities.validation.customCategoryRequired": "Introduce un nombre de categoría personalizado.",
  "pending.pendingUnitPackage":
    "El registro de tu unidad está en revisión. Podrás usar la app cuando un administrador lo apruebe.",
  "topBar.discoverPlacesCount_one": "{{count}} lugar",
};

const en = JSON.parse(fs.readFileSync(path.join(root, "en.json"), "utf8"));
const ar = JSON.parse(fs.readFileSync(path.join(root, "ar.json"), "utf8"));
const es = JSON.parse(fs.readFileSync(path.join(root, "es.json"), "utf8"));

const flatEn = flat(en);
let appliedAr = 0;
let appliedEs = 0;
let copiedPm = 0;

for (const [key, value] of Object.entries(AR)) {
  setPath(ar, key, value);
  appliedAr++;
}

for (const [key, value] of Object.entries(ES)) {
  setPath(es, key, value);
  appliedEs++;
}

// propertyMgmt: copy English until dedicated AR/ES pass (keeps keys resolvable)
const flatAr = flat(ar);
for (const key of Object.keys(flatEn)) {
  if (!key.startsWith("propertyMgmt.")) continue;
  if (key in flatAr) continue;
  setPath(ar, key, flatEn[key]);
  setPath(es, key, flatEn[key]);
  copiedPm++;
}

fs.writeFileSync(path.join(root, "ar.json"), `${JSON.stringify(ar, null, 2)}\n`, "utf8");
fs.writeFileSync(path.join(root, "es.json"), `${JSON.stringify(es, null, 2)}\n`, "utf8");

console.log(`Applied AR: ${appliedAr}, ES: ${appliedEs}, propertyMgmt copied from en: ${copiedPm}`);