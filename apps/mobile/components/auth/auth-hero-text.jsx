import React from "react";
import { View, Text } from "react-native";
import { authLayoutStyles as layout } from "../../constants/auth-layout";

/** Left-aligned auth headline block — professional app style */
export default function AuthHeroText({ eyebrow, title, subtitle, children }) {
  return (
    <View style={layout.heroBlock}>
      {eyebrow ? <Text style={layout.eyebrow}>{eyebrow}</Text> : null}
      <Text style={layout.title}>{title}</Text>
      {subtitle ? <Text style={layout.subtitle}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}
