import SideMenu from "../ui/side-menu";

export default function ScreenShell({ menu, children }) {
  return (
    <>
      {children}
      <SideMenu visible={menu.visible} onClose={menu.closeMenu} />
    </>
  );
}
