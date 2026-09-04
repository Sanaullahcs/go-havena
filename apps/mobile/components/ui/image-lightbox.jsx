import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  FlatList,
  StyleSheet,
  StatusBar,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Fonts } from "../../constants/font";
import { resolveAppImageSource } from "../../utils/profile-display";
import { sf, sw } from "../../utils/responsive";

function ZoomableImage({ uri, width, height }) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);

  useEffect(() => {
    scale.value = 1;
    savedScale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    savedX.value = 0;
    savedY.value = 0;
  }, [uri, scale, savedScale, translateX, translateY, savedX, savedY]);

  const pinch = Gesture.Pinch()
    .onUpdate((event) => {
      const next = savedScale.value * event.scale;
      scale.value = Math.min(4, Math.max(1, next));
    })
    .onEnd(() => {
      if (scale.value <= 1.02) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedX.value = 0;
        savedY.value = 0;
        return;
      }
      savedScale.value = scale.value;
    });

  const pan = Gesture.Pan()
    .manualActivation(true)
    .onTouchesMove((_, manager) => {
      if (savedScale.value > 1) {
        manager.activate();
        return;
      }
      manager.fail();
    })
    .onUpdate((event) => {
      if (scale.value <= 1) return;
      translateX.value = savedX.value + event.translationX;
      translateY.value = event.translationY + savedY.value;
    })
    .onEnd(() => {
      savedX.value = translateX.value;
      savedY.value = translateY.value;
    });

  const composed = Gesture.Simultaneous(pinch, pan);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={[styles.zoomFrame, { width, height }, animatedStyle]}>
        <Image
          source={resolveAppImageSource(uri)}
          style={styles.zoomImage}
          contentFit="contain"
          transition={160}
        />
      </Animated.View>
    </GestureDetector>
  );
}

export default function ImageLightbox({ visible, uris, initialIndex = 0, onClose }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const images = useMemo(
    () => (Array.isArray(uris) ? uris.map((item) => String(item ?? "").trim()).filter(Boolean) : []),
    [uris],
  );
  const [index, setIndex] = useState(initialIndex);

  useEffect(() => {
    if (visible) {
      const start = Math.min(Math.max(initialIndex, 0), Math.max(images.length - 1, 0));
      setIndex(start);
    }
  }, [visible, initialIndex, images.length]);

  const onViewableItemsChanged = useCallback(({ viewableItems }) => {
    const next = viewableItems?.[0]?.index;
    if (typeof next === "number") setIndex(next);
  }, []);

  const viewabilityConfig = useMemo(() => ({ itemVisiblePercentThreshold: 60 }), []);

  if (!images.length) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <StatusBar barStyle="light-content" />
      <View style={styles.root}>
        <FlatList
          key={`${visible}-${initialIndex}-${images.length}`}
          data={images}
          keyExtractor={(item, itemIndex) => `${item}-${itemIndex}`}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={Math.min(Math.max(initialIndex, 0), images.length - 1)}
          getItemLayout={(_, itemIndex) => ({
            length: width,
            offset: width * itemIndex,
            index: itemIndex,
          })}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          renderItem={({ item }) => (
            <View style={{ width, height }}>
              <ZoomableImage uri={item} width={width} height={height} />
            </View>
          )}
        />

        <Pressable
          onPress={onClose}
          style={[styles.closeBtn, { top: Math.max(insets.top, 12) + 8 }]}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t("common.close")}
        >
          <Feather name="x" size={sf(20)} color="#FFFFFF" />
        </Pressable>

        {images.length > 1 ? (
          <View style={[styles.counter, { bottom: Math.max(insets.bottom, 12) + 12 }]}>
            <Text style={styles.counterText}>
              {index + 1} / {images.length}
            </Text>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.96)",
  },
  zoomFrame: {
    alignItems: "center",
    justifyContent: "center",
  },
  zoomImage: {
    width: "100%",
    height: "100%",
  },
  closeBtn: {
    position: "absolute",
    start: sw(16),
    zIndex: 4,
    elevation: 4,
    width: sw(40),
    height: sw(40),
    borderRadius: sw(12),
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  counter: {
    position: "absolute",
    alignSelf: "center",
    paddingHorizontal: sw(12),
    paddingVertical: sw(5),
    borderRadius: 999,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
  },
  counterText: {
    fontFamily: Fonts.semiBold,
    fontSize: sf(12),
    color: "#FFFFFF",
  },
});
