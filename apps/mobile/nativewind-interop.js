import { cssInterop } from "nativewind";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScrollView } from "react-native";

cssInterop(LinearGradient, { className: "style" });
cssInterop(Image, { className: "style" });
cssInterop(SafeAreaView, { className: "style" });
cssInterop(ScrollView, { contentContainerClassName: "contentContainerStyle" });
