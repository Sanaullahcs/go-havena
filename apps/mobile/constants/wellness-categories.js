export function wellnessDetailRouteParams(category) {
  return {
    title: category.title,
    subTitle: category.subtitle ?? category.subTitle ?? "",
    type: category.key ?? category.type,
  };
}

export function wellnessCategoryLabel(type) {
  return type ?? "";
}
