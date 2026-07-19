(() => {
  "use strict";

  const ua = navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/i.test(ua);
  const isIPadDesktopMode =
    navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  const isAndroid = /Android/i.test(ua);

  const isStudentOnlyDevice = isIOS || isIPadDesktopMode || isAndroid;

  window.AppDeviceMode = Object.freeze({
    isStudentOnlyDevice,
    isComputerManagementDevice: !isStudentOnlyDevice
  });

  document.documentElement.classList.toggle(
    "student-only-device",
    isStudentOnlyDevice
  );
})();
