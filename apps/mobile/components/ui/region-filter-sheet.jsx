import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import LocaleTextInput from "./locale-text-input";
import { Fonts } from "../../constants/font";
import { HomeTheme as T } from "../../constants/home-theme";
import { fetchCountryStates, fetchStateCities, getCachedCountries, prefetchCountries } from "../../services/geography-api";
import { getApiErrorMessage } from "../../utils/auth-errors";

function matchesQuery(item, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [item.name, item.code]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(q));
}

const SEARCH_FONT_SIZE = 13;
const SEARCH_ROW_HEIGHT = 44;
const LIST_MAX_HEIGHT = 220;
const LIST_TARGET_HEIGHT = 168;
const LIST_GAP = 12;

/**
 * No height and no lineHeight. iOS top-aligns and clips TextInput glyphs when
 * lineHeight is set, and vertical padding shrinks the box those glyphs need.
 * The 44px row centers this intrinsic line with the icon and clear button.
 * Plain object so the text-metrics patch cannot inject lineHeight.
 */
const dropdownInputStyle = {
  flex: 1,
  alignSelf: "center",
  margin: 0,
  paddingHorizontal: 0,
  paddingTop: 0,
  paddingBottom: 0,
  fontFamily: Fonts.regular,
  fontSize: SEARCH_FONT_SIZE,
  color: T.navy,
  textAlignVertical: "center",
  includeFontPadding: Platform.OS === "android",
};

function keyboardTopFromEvent(event) {
  const { screenY, height } = event?.endCoordinates || {};
  const windowHeight = Dimensions.get("window").height;
  if (Number.isFinite(screenY) && screenY > 0) {
    // Android resize already ends the window at the keyboard, so the
    // visible bottom is the window itself.
    if (screenY >= windowHeight - 1) return windowHeight;
    return screenY;
  }
  if (Platform.OS === "android") return windowHeight;
  if (Number.isFinite(height)) return windowHeight - height;
  return null;
}

function currentKeyboardTop() {
  const metrics = Keyboard.metrics?.();
  if (!metrics) return null;
  return keyboardTopFromEvent({ endCoordinates: metrics });
}

function SearchableField({
  label,
  placeholder,
  searchPlaceholder,
  value,
  options,
  loading,
  disabled,
  disabledHint,
  emptyText,
  allowCustom = false,
  onSelect,
  scrollRef,
  scrollOffsetRef,
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [listMaxHeight, setListMaxHeight] = useState(LIST_MAX_HEIGHT);
  const fieldRef = useRef(null);
  const searchRowRef = useRef(null);
  const keyboardTopRef = useRef(null);
  const fitTimerRef = useRef(null);
  const fitRetryRef = useRef(null);

  const filtered = useMemo(
    () => options.filter((item) => item?.name && matchesQuery(item, query)),
    [options, query],
  );
  const customName = query.trim();
  const showCustom =
    allowCustom &&
    customName.length >= 2 &&
    !filtered.some((item) => String(item.name).toLowerCase() === customName.toLowerCase());

  const close = () => {
    setQuery("");
    setOpen(false);
    setListMaxHeight(LIST_MAX_HEIGHT);
  };

  const toggleOpen = () => {
    if (disabled) return;
    setOpen((prev) => !prev);
  };

  const setListHeight = useCallback((next) => {
    const clamped = Math.min(LIST_MAX_HEIGHT, Math.max(0, Math.round(next)));
    setListMaxHeight((current) => (Math.abs(current - clamped) < 4 ? current : clamped));
  }, []);

  const fitToKeyboard = useCallback((keyboardTop) => {
    const row = searchRowRef.current;
    if (!open || !row || !Number.isFinite(keyboardTop)) return;

    row.measureInWindow((_x, rowY, _w, rowH) => {
      if (!Number.isFinite(rowY)) return;
      const searchBottom = rowY + rowH;
      const scroll = scrollRef?.current;

      const applyMeasured = () => {
        row.measureInWindow((_x2, y2, _w2, h2) => {
          if (!Number.isFinite(y2)) return;
          setListHeight(keyboardTop - (y2 + h2) - LIST_GAP);
        });
      };

      if (!scroll) {
        setListHeight(keyboardTop - searchBottom - LIST_GAP);
        return;
      }

      scroll.measureInWindow((_sx, viewY, _sw, viewH) => {
        const visibleBottom = Math.min(keyboardTop, viewY + viewH);
        const room = visibleBottom - searchBottom - LIST_GAP;
        if (room >= LIST_TARGET_HEIGHT || !scrollOffsetRef) {
          setListHeight(room);
          return;
        }

        const deficit = LIST_TARGET_HEIGHT - Math.max(room, 0);
        const maxLift = Math.max(0, rowY - (viewY + 8));
        const lift = Math.min(deficit, maxLift);
        if (lift > 4) {
          const nextOffset = scrollOffsetRef.current + lift;
          scrollOffsetRef.current = nextOffset;
          scroll.scrollTo({ y: Math.max(0, nextOffset), animated: false });
          requestAnimationFrame(applyMeasured);
          return;
        }

        setListHeight(room);
      });
    });
  }, [open, scrollOffsetRef, scrollRef, setListHeight]);

  const scheduleFit = useCallback((keyboardTop) => {
    if (!Number.isFinite(keyboardTop)) return;
    keyboardTopRef.current = keyboardTop;
    if (fitTimerRef.current) clearTimeout(fitTimerRef.current);
    if (fitRetryRef.current) clearTimeout(fitRetryRef.current);
    // iOS adds scroll padding on keyboardWillShow; measure after that layout.
    const delay = Platform.OS === "ios" ? 80 : 140;
    fitTimerRef.current = setTimeout(() => fitToKeyboard(keyboardTop), delay);
    fitRetryRef.current = setTimeout(() => fitToKeyboard(keyboardTop), delay + 220);
  }, [fitToKeyboard]);

  useEffect(() => {
    if (!open) return undefined;

    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const onShow = (event) => {
      const top = keyboardTopFromEvent(event);
      if (top != null) scheduleFit(top);
    };
    const onHide = () => {
      keyboardTopRef.current = null;
      if (fitTimerRef.current) clearTimeout(fitTimerRef.current);
      if (fitRetryRef.current) clearTimeout(fitRetryRef.current);
      setListMaxHeight(LIST_MAX_HEIGHT);
    };

    const subs = [
      Keyboard.addListener(showEvent, onShow),
      Keyboard.addListener(hideEvent, onHide),
    ];
    if (Platform.OS === "ios") {
      subs.push(Keyboard.addListener("keyboardDidShow", onShow));
    } else {
      subs.push(Keyboard.addListener("keyboardDidHide", onHide));
    }

    const alreadyOpen = currentKeyboardTop();
    if (alreadyOpen != null) scheduleFit(alreadyOpen);

    return () => {
      if (fitTimerRef.current) clearTimeout(fitTimerRef.current);
      if (fitRetryRef.current) clearTimeout(fitRetryRef.current);
      subs.forEach((sub) => sub.remove());
    };
  }, [open, scheduleFit]);

  return (
    <View ref={fieldRef} collapsable={false} style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View
        style={[styles.fieldButton, disabled && styles.fieldButtonDisabled, open && styles.fieldButtonOpen]}
      >
        <Pressable
          style={styles.fieldButtonHit}
          disabled={disabled}
          onPressIn={toggleOpen}
          android_ripple={disabled ? null : { color: "rgba(15, 23, 42, 0.06)" }}
          accessibilityRole="button"
          accessibilityState={{ disabled, expanded: open }}
        >
          <Text
            style={[styles.fieldValue, !value && styles.fieldPlaceholder]}
            numberOfLines={1}
            allowFontScaling={false}
          >
            {value?.name || (disabled ? disabledHint : placeholder)}
          </Text>
        </Pressable>
        {value && !disabled ? (
          <Pressable
            hitSlop={8}
            onPressIn={() => onSelect(null)}
            accessibilityLabel={t("region.clearFilter")}
            style={styles.fieldTrailing}
          >
            <Ionicons name="close-circle" size={18} color={T.gray} />
          </Pressable>
        ) : (
          <Pressable disabled={disabled} onPressIn={toggleOpen} hitSlop={8} style={styles.fieldTrailing}>
            <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={T.gray} />
          </Pressable>
        )}
      </View>

      {open && !disabled ? (
        <View style={styles.dropdown}>
          <View ref={searchRowRef} collapsable={false} style={styles.dropdownSearch}>
            <Ionicons name="search-outline" size={16} color={T.gray} />
            <LocaleTextInput
              value={query}
              onChangeText={setQuery}
              placeholder={searchPlaceholder}
              placeholderTextColor={T.gray}
              style={dropdownInputStyle}
              allowFontScaling={false}
              scrollEnabled={false}
              underlineColorAndroid="transparent"
              autoCorrect={false}
              autoCapitalize="none"
              onFocus={() => {
                const top = currentKeyboardTop();
                if (top != null) scheduleFit(top);
              }}
            />
            {query.length > 0 ? (
              <Pressable onPress={() => setQuery("")} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color={T.gray} />
              </Pressable>
            ) : null}
          </View>

          {loading && filtered.length === 0 ? (
            <View style={styles.dropdownState}>
              <ActivityIndicator size="small" color={T.navy} />
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyboardShouldPersistTaps="always"
              style={[styles.dropdownList, { maxHeight: listMaxHeight }]}
              nestedScrollEnabled
              initialNumToRender={14}
              maxToRenderPerBatch={14}
              windowSize={6}
              removeClippedSubviews={Platform.OS === "android"}
              keyExtractor={(item, index) => `${item.id ?? item.name}-${index}`}
              ListHeaderComponent={
                showCustom ? (
                  <TouchableOpacity
                    style={styles.option}
                    activeOpacity={0.85}
                    delayPressIn={0}
                    onPress={() => {
                      onSelect({ id: `custom:${customName}`, name: customName });
                      close();
                    }}
                  >
                    <Text style={styles.optionText}>{t("region.useTypedCity", { city: customName })}</Text>
                  </TouchableOpacity>
                ) : null
              }
              ListEmptyComponent={
                !showCustom ? <Text style={styles.dropdownEmpty}>{emptyText}</Text> : null
              }
              renderItem={({ item }) => {
                const selected = value?.id != null && String(value.id) === String(item.id);
                return (
                  <TouchableOpacity
                    style={[styles.option, selected && styles.optionSelected]}
                    activeOpacity={0.85}
                    delayPressIn={0}
                    onPress={() => {
                      onSelect(item);
                      close();
                    }}
                  >
                    <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                      {item.name}
                    </Text>
                    {item.code ? <Text style={styles.optionMeta}>{item.code}</Text> : null}
                    {selected ? <Ionicons name="checkmark" size={16} color={T.navy} /> : null}
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>
      ) : null}
    </View>
  );
}

export default function RegionFilterSheet({
  visible = true,
  embedded = false,
  country,
  state,
  city,
  onApply,
  onClose,
  scrollRef,
  scrollOffsetRef,
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const modalScrollRef = useRef(null);
  const modalOffsetRef = useRef(0);
  const activeScrollRef = scrollRef ?? modalScrollRef;
  const activeOffsetRef = scrollOffsetRef ?? modalOffsetRef;
  const active = embedded || visible;
  const [draftCountry, setDraftCountry] = useState(country);
  const [draftState, setDraftState] = useState(state);
  const [draftCity, setDraftCity] = useState(city);
  const [countries, setCountries] = useState(() => getCachedCountries());
  const [states, setStates] = useState([]);
  const [cities, setCities] = useState([]);
  const [loadingCountries, setLoadingCountries] = useState(() => getCachedCountries().length === 0);
  const [loadingStates, setLoadingStates] = useState(false);
  const [loadingCities, setLoadingCities] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!active) return;
    setDraftCountry(country);
    setDraftState(state);
    setDraftCity(city);
    setError(null);
  }, [active, country, state, city]);

  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    const cached = getCachedCountries();
    if (cached.length) {
      setCountries(cached);
      setLoadingCountries(false);
    } else {
      setLoadingCountries(true);
    }

    prefetchCountries()
      .then((list) => {
        if (!cancelled) setCountries(list);
      })
      .catch((err) => {
        if (!cancelled) setError(getApiErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoadingCountries(false);
      });

    return () => {
      cancelled = true;
    };
  }, [active]);

  useEffect(() => {
    if (!active || !draftCountry?.id) {
      setStates([]);
      return undefined;
    }

    let cancelled = false;
    (async () => {
      setLoadingStates(true);
      try {
        const list = await fetchCountryStates(draftCountry.id);
        if (!cancelled) setStates(list);
      } catch (err) {
        if (!cancelled) {
          setStates([]);
          setError(getApiErrorMessage(err));
        }
      } finally {
        if (!cancelled) setLoadingStates(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [active, draftCountry?.id]);

  useEffect(() => {
    if (!active || !draftState?.id) {
      setCities([]);
      return undefined;
    }

    let cancelled = false;
    (async () => {
      setLoadingCities(true);
      try {
        const list = await fetchStateCities(draftState.id);
        if (!cancelled) setCities(list);
      } catch (err) {
        if (!cancelled) {
          setCities([]);
          setError(getApiErrorMessage(err));
        }
      } finally {
        if (!cancelled) setLoadingCities(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [active, draftState?.id]);

  const emit = (nextCountry, nextState, nextCity) => {
    onApply({ country: nextCountry, state: nextState, city: nextCity });
  };

  const handleCountrySelect = (next) => {
    setDraftCountry(next);
    setDraftState(null);
    setDraftCity(null);
    setError(null);
    if (embedded) emit(next, null, null);
  };

  const handleStateSelect = (next) => {
    setDraftState(next);
    setDraftCity(null);
    setError(null);
    if (embedded) emit(draftCountry, next, null);
  };

  const handleClear = () => {
    setDraftCountry(null);
    setDraftState(null);
    setDraftCity(null);
    onApply({ country: null, state: null, city: null });
  };

  const fields = (
    <>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <SearchableField
        label={t("region.country")}
        placeholder={t("region.selectCountry")}
        searchPlaceholder={t("region.searchCountries")}
        value={draftCountry}
        options={countries}
        loading={loadingCountries}
        emptyText={t("region.noCountriesMatch")}
        onSelect={handleCountrySelect}
        scrollRef={activeScrollRef}
        scrollOffsetRef={activeOffsetRef}
      />
      <SearchableField
        label={t("region.state")}
        placeholder={t("region.selectState")}
        searchPlaceholder={t("region.searchStates")}
        value={draftState}
        options={states}
        loading={loadingStates}
        disabled={!draftCountry}
        disabledHint={t("region.pickCountryFirst")}
        emptyText={t("region.noStatesMatch")}
        onSelect={handleStateSelect}
        scrollRef={activeScrollRef}
        scrollOffsetRef={activeOffsetRef}
      />
      <SearchableField
        label={t("region.city")}
        placeholder={t("region.selectCity")}
        searchPlaceholder={t("region.searchCities")}
        value={draftCity}
        options={cities}
        loading={loadingCities}
        disabled={!draftState}
        disabledHint={t("region.pickStateFirst")}
        emptyText={t("region.noCitiesMatch")}
        allowCustom
        scrollRef={activeScrollRef}
        scrollOffsetRef={activeOffsetRef}
        onSelect={(next) => {
          setDraftCity(next);
          if (embedded) emit(draftCountry, draftState, next);
        }}
      />
    </>
  );

  if (embedded) {
    return <View>{fields}</View>;
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]} onPress={(e) => e.stopPropagation()}>
          <ScrollView
            ref={modalScrollRef}
            keyboardShouldPersistTaps="always"
            keyboardDismissMode="none"
            showsVerticalScrollIndicator={false}
            onScroll={(event) => {
              modalOffsetRef.current = event.nativeEvent.contentOffset.y;
            }}
            scrollEventThrottle={16}
          >
          <View style={styles.handle} />
          <Text style={styles.title}>{t("region.filterRegions")}</Text>
          <Text style={styles.subtitle}>{t("region.filterHint")}</Text>
          {fields}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.clearBtn} onPress={handleClear} activeOpacity={0.85}>
              <Text style={styles.clearText}>{t("region.clearFilter")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.applyBtn}
              onPress={() => onApply({ country: draftCountry, state: draftState, city: draftCity })}
              activeOpacity={0.88}
            >
              <Text style={styles.applyText}>{t("region.applyFilter")}</Text>
            </TouchableOpacity>
          </View>
          </ScrollView>
        </Pressable>
      </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    maxHeight: "86%",
    backgroundColor: T.white,
    borderTopStartRadius: 24,
    borderTopEndRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 10,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: T.border,
    marginBottom: 16,
  },
  title: {
    fontFamily: Fonts.bold,
    fontSize: 17,
    lineHeight: 22,
    color: T.navy,
    fontWeight: "700",
  },
  subtitle: {
    marginTop: 6,
    marginBottom: 16,
    fontFamily: Fonts.regular,
    fontSize: 12,
    lineHeight: 17,
    color: T.gray,
  },
  errorText: {
    marginBottom: 10,
    fontFamily: Fonts.regular,
    fontSize: 12,
    color: "#DC2626",
  },
  field: {
    marginBottom: 14,
  },
  fieldLabel: {
    marginBottom: 8,
    fontFamily: Fonts.semiBold,
    fontSize: 13,
    color: T.navy,
    fontWeight: "600",
  },
  fieldButton: {
    height: 52,
    borderRadius: 16,
    backgroundColor: T.white,
    borderWidth: 1,
    borderColor: T.border,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
  },
  fieldButtonHit: {
    flex: 1,
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    paddingEnd: 10,
  },
  fieldTrailing: {
    height: 52,
    justifyContent: "center",
    alignItems: "center",
  },
  fieldButtonOpen: {
    borderColor: T.teal,
  },
  fieldButtonDisabled: {
    backgroundColor: T.canvas,
  },
  fieldValue: {
    flex: 1,
    margin: 0,
    paddingTop: 0,
    paddingBottom: 0,
    fontFamily: Fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: T.navy,
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  fieldPlaceholder: {
    color: T.gray,
  },
  dropdown: {
    marginTop: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.white,
    overflow: "hidden",
  },
  dropdownSearch: {
    height: SEARCH_ROW_HEIGHT,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dropdownList: {
    flexGrow: 0,
  },
  dropdownState: {
    paddingVertical: 20,
    alignItems: "center",
  },
  dropdownEmpty: {
    paddingVertical: 18,
    paddingHorizontal: 14,
    fontFamily: Fonts.regular,
    fontSize: 13,
    color: T.gray,
    textAlign: "center",
  },
  option: {
    minHeight: 46,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  optionSelected: {
    backgroundColor: T.mint,
  },
  optionText: {
    flex: 1,
    fontFamily: Fonts.medium,
    fontSize: 13,
    color: T.navy,
  },
  optionTextSelected: {
    fontFamily: Fonts.semiBold,
    fontWeight: "600",
  },
  optionMeta: {
    fontFamily: Fonts.regular,
    fontSize: 11,
    color: T.gray,
  },
  actions: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  clearBtn: {
    height: 48,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: T.border,
    alignItems: "center",
    justifyContent: "center",
  },
  clearText: {
    fontFamily: Fonts.semiBold,
    fontSize: 13,
    color: T.navy,
    fontWeight: "600",
  },
  applyBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: T.navy,
    alignItems: "center",
    justifyContent: "center",
  },
  applyText: {
    fontFamily: Fonts.semiBold,
    fontSize: 13,
    color: T.white,
    fontWeight: "600",
  },
});

