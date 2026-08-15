using System;
using System.IO;
using System.Text;
using System.Runtime.InteropServices;
using System.Collections.Generic;
using System.Diagnostics;
using System.Threading;
using System.Drawing;
using System.Drawing.Imaging;
using System.Windows.Forms;

namespace Win32Bridge {
    class Program {
        [DllImport("user32.dll")]
        static extern IntPtr GetForegroundWindow();

        [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

        [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        static extern int GetWindowTextLength(IntPtr hWnd);

        [DllImport("user32.dll")]
        static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        static extern bool IsWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        static extern bool IsWindowVisible(IntPtr hWnd);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        static extern bool IsIconic(IntPtr hWnd);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        static extern bool SetForegroundWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        static extern IntPtr SetFocus(IntPtr hWnd);

        [DllImport("user32.dll", SetLastError = true)]
        static extern uint SendInput(uint nInputs, [MarshalAs(UnmanagedType.LPArray), In] INPUT[] pInputs, int cbSize);

        [DllImport("kernel32.dll")]
        static extern uint GetCurrentThreadId();

        [DllImport("user32.dll")]
        static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);

        [DllImport("user32.dll")]
        static extern bool BringWindowToTop(IntPtr hWnd);

        [DllImport("user32.dll")]
        static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

        [DllImport("user32.dll")]
        static extern bool AllowSetForegroundWindow(int dwProcessId);

        [DllImport("gdi32.dll")]
        static extern bool BitBlt(IntPtr hObject, int nXDest, int nYDest, int nWidth, int nHeight, IntPtr hObjectSource, int nXSrc, int nYSrc, int dwRop);

        [DllImport("gdi32.dll")]
        static extern IntPtr CreateCompatibleBitmap(IntPtr hDC, int nWidth, int nHeight);

        [DllImport("gdi32.dll")]
        static extern IntPtr CreateCompatibleDC(IntPtr hDC);

        [DllImport("gdi32.dll")]
        static extern bool DeleteDC(IntPtr hDC);

        [DllImport("gdi32.dll")]
        static extern bool DeleteObject(IntPtr hObject);

        [DllImport("gdi32.dll")]
        static extern IntPtr SelectObject(IntPtr hDC, IntPtr hObject);

        [DllImport("user32.dll")]
        static extern IntPtr GetDesktopWindow();

        [DllImport("user32.dll")]
        static extern IntPtr GetWindowDC(IntPtr hWnd);

        [DllImport("user32.dll")]
        static extern int ReleaseDC(IntPtr hWnd, IntPtr hDC);

        [DllImport("user32.dll")]
        static extern int GetSystemMetrics(int smIndex);

        [DllImport("user32.dll")]
        static extern bool SetProcessDPIAware();

        const int SRCCOPY = 0x00CC0020;
        const int SM_XVIRTUALSCREEN = 76;
        const int SM_YVIRTUALSCREEN = 77;
        const int SM_CXVIRTUALSCREEN = 78;
        const int SM_CYVIRTUALSCREEN = 79;

        const int SW_SHOW = 5;
        const int SW_RESTORE = 9;
        const uint INPUT_KEYBOARD = 1;
        const uint KEYEVENTF_KEYUP = 0x0002;
        const uint KEYEVENTF_UNICODE = 0x0004;
        const byte VK_MENU = 0x12;
        const ushort VK_RETURN = 0x0D;
        const ushort VK_TAB = 0x09;
        const int ASFW_ANY = -1;

        [StructLayout(LayoutKind.Sequential)]
        public struct MOUSEINPUT {
            public int dx;
            public int dy;
            public uint mouseData;
            public uint dwFlags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct KEYBDINPUT {
            public ushort wVk;
            public ushort wScan;
            public uint dwFlags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct HARDWAREINPUT {
            public uint uMsg;
            public ushort wParamL;
            public ushort wParamH;
        }

        [StructLayout(LayoutKind.Explicit)]
        public struct INPUT {
            [FieldOffset(0)]
            public uint type;
            [FieldOffset(8)]
            public MOUSEINPUT mi;
            [FieldOffset(8)]
            public KEYBDINPUT ki;
            [FieldOffset(8)]
            public HARDWAREINPUT hi;
        }

        static readonly int InputSize = Marshal.SizeOf(typeof(INPUT));

        static bool RobustFocusWindow(IntPtr hWnd) {
            if (!IsWindow(hWnd)) return false;

            try {
                AllowSetForegroundWindow(ASFW_ANY);

                if (IsIconic(hWnd)) {
                    ShowWindow(hWnd, SW_RESTORE);
                } else {
                    ShowWindow(hWnd, SW_SHOW);
                }
                BringWindowToTop(hWnd);

                IntPtr fgHwnd = GetForegroundWindow();
                if (fgHwnd != hWnd) {
                    uint curThread = GetCurrentThreadId();
                    uint dummy;
                    uint fgThread = fgHwnd != IntPtr.Zero ? GetWindowThreadProcessId(fgHwnd, out dummy) : 0;
                    uint targetThread = GetWindowThreadProcessId(hWnd, out dummy);

                    if (fgThread != 0 && fgThread != curThread) {
                        AttachThreadInput(curThread, fgThread, true);
                    }
                    if (targetThread != 0 && targetThread != curThread) {
                        AttachThreadInput(curThread, targetThread, true);
                    }

                    // Alt pulse to reset foreground lock timeout
                    keybd_event(VK_MENU, 0, 0, UIntPtr.Zero);
                    keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);

                    SetForegroundWindow(hWnd);
                    SetFocus(hWnd);

                    if (fgThread != 0 && fgThread != curThread) {
                        AttachThreadInput(curThread, fgThread, false);
                    }
                    if (targetThread != 0 && targetThread != curThread) {
                        AttachThreadInput(curThread, targetThread, false);
                    }
                } else {
                    SetForegroundWindow(hWnd);
                }

                return true;
            } catch {
                return false;
            }
        }

        [DllImport("user32.dll")]
        static extern uint MapVirtualKey(uint uCode, uint uMapType);

        static void SendStringAtomic(string text) {
            if (string.IsNullOrEmpty(text)) return;

            // Split into text segments if there are Enter or Tab characters
            // Text is sent in atomic Unicode batches, and Enter/Tab are sent as VK events
            List<INPUT> batch = new List<INPUT>();

            for (int i = 0; i < text.Length; i++) {
                char c = text[i];

                // Handle literal backslash escape sequences (\n, \t, \r, \\)
                if (c == '\\' && i + 1 < text.Length) {
                    char next = text[i + 1];
                    if (next == 'n' || next == 'N') {
                        i++;
                        c = '\n';
                    }
                    else if (next == 't' || next == 'T') {
                        i++;
                        c = '\t';
                    }
                    else if (next == 'r' || next == 'R') {
                        i++;
                        continue;
                    }
                    else if (next == '\\') {
                        i++;
                        c = '\\';
                    }
                }

                if (c == '\r') continue;

                if (c == '\n') {
                    // Flush existing Unicode batch
                    if (batch.Count > 0) {
                        SendInput((uint)batch.Count, batch.ToArray(), InputSize);
                        batch.Clear();
                        Thread.Sleep(30);
                    }

                    // Send Enter (VK_RETURN)
                    INPUT[] enter = new INPUT[2];
                    enter[0].type = INPUT_KEYBOARD;
                    enter[0].ki.wVk = VK_RETURN;
                    enter[0].ki.wScan = (ushort)MapVirtualKey(VK_RETURN, 0);
                    enter[0].ki.dwFlags = 0;

                    enter[1].type = INPUT_KEYBOARD;
                    enter[1].ki.wVk = VK_RETURN;
                    enter[1].ki.wScan = (ushort)MapVirtualKey(VK_RETURN, 0);
                    enter[1].ki.dwFlags = KEYEVENTF_KEYUP;

                    SendInput(2, enter, InputSize);
                    Thread.Sleep(35);
                }
                else if (c == '\t') {
                    // Flush existing Unicode batch
                    if (batch.Count > 0) {
                        SendInput((uint)batch.Count, batch.ToArray(), InputSize);
                        batch.Clear();
                        Thread.Sleep(20);
                    }

                    // Send Tab (VK_TAB)
                    INPUT[] tab = new INPUT[2];
                    tab[0].type = INPUT_KEYBOARD;
                    tab[0].ki.wVk = VK_TAB;
                    tab[0].ki.wScan = (ushort)MapVirtualKey(VK_TAB, 0);
                    tab[0].ki.dwFlags = 0;

                    tab[1].type = INPUT_KEYBOARD;
                    tab[1].ki.wVk = VK_TAB;
                    tab[1].ki.wScan = (ushort)MapVirtualKey(VK_TAB, 0);
                    tab[1].ki.dwFlags = KEYEVENTF_KEYUP;

                    SendInput(2, tab, InputSize);
                    Thread.Sleep(25);
                }
                else {
                    // Unicode char
                    INPUT down = new INPUT();
                    down.type = INPUT_KEYBOARD;
                    down.ki.wVk = 0;
                    down.ki.wScan = (ushort)c;
                    down.ki.dwFlags = KEYEVENTF_UNICODE;

                    INPUT up = new INPUT();
                    up.type = INPUT_KEYBOARD;
                    up.ki.wVk = 0;
                    up.ki.wScan = (ushort)c;
                    up.ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;

                    batch.Add(down);
                    batch.Add(up);
                }
            }

            // Flush any remaining characters in one atomic batch
            if (batch.Count > 0) {
                SendInput((uint)batch.Count, batch.ToArray(), InputSize);
            }
        }

        static string EscapeJson(string s) {
            if (s == null) return "";
            return s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", "\\r").Replace("\n", "\\n").Replace("\t", "\\t");
        }

        delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

        [DllImport("user32.dll")]
        static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

        static IntPtr FindWindowByQueries(string[] queries) {
            if (queries == null || queries.Length == 0) return IntPtr.Zero;
            List<string> cleanQueries = new List<string>();
            foreach (string q in queries) {
                if (!string.IsNullOrEmpty(q)) cleanQueries.Add(q.Trim().ToUpper());
            }
            if (cleanQueries.Count == 0) return IntPtr.Zero;

            IntPtr bestMatch = IntPtr.Zero;

            EnumWindows(delegate(IntPtr hWnd, IntPtr lParam) {
                if (!IsWindow(hWnd)) return true;

                bool isVis = IsWindowVisible(hWnd) || IsIconic(hWnd);
                if (!isVis) return true;

                int len = GetWindowTextLength(hWnd);
                if (len <= 0) return true;

                StringBuilder sb = new StringBuilder(len + 1);
                GetWindowText(hWnd, sb, len + 1);
                string title = sb.ToString().ToUpper();

                if (title.Contains("FE MACRO CONSOLE") || title.Contains("SCREEN OCR")) return true;

                uint pid;
                GetWindowThreadProcessId(hWnd, out pid);
                string procName = "";
                try {
                    procName = Process.GetProcessById((int)pid).ProcessName.ToUpper();
                } catch {}

                if (procName == "ELECTRON" || procName == "NODE" || procName.Contains("FE-MACRO") || procName.Contains("WIN32BRIDGE")) return true;

                foreach (string q in cleanQueries) {
                    string cleanQ = q.Replace(".EXE", "");
                    if (procName == cleanQ || procName == q || procName.StartsWith(cleanQ) || cleanQ.StartsWith(procName)) {
                        bestMatch = hWnd;
                        return false;
                    }
                    if (title.Contains(cleanQ)) {
                        if (bestMatch == IntPtr.Zero) bestMatch = hWnd;
                    }
                }
                return true;
            }, IntPtr.Zero);

            return bestMatch;
        }

        static void Main(string[] args) {
            try { SetProcessDPIAware(); } catch {}
            try { Console.OutputEncoding = new UTF8Encoding(false); } catch {}
            try { Console.InputEncoding = new UTF8Encoding(false); } catch {}

            TextReader reader = null;
            TextWriter writer = null;

            try {
                reader = new StreamReader(Console.OpenStandardInput(), new UTF8Encoding(false));
                writer = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false)) { AutoFlush = true };
            } catch {
                reader = Console.In;
                writer = Console.Out;
            }

            string line;
            while ((line = reader.ReadLine()) != null) {
                line = line.Trim();
                if (line == "exit" || line == "quit") break;
                if (string.IsNullOrEmpty(line)) continue;

                try {
                    string[] parts = line.Split(new char[] { '|' });
                    string cmd = parts[0];

                    if (cmd == "GET_FOREGROUND") {
                        IntPtr hwnd = GetForegroundWindow();
                        if (hwnd == IntPtr.Zero) {
                            writer.WriteLine("{\"ok\":true,\"hwnd\":0,\"title\":\"\",\"processName\":\"\"}");
                            continue;
                        }

                        int len = GetWindowTextLength(hwnd);
                        StringBuilder sb = new StringBuilder(len + 1);
                        if (len > 0) GetWindowText(hwnd, sb, len + 1);
                        string title = sb.ToString();

                        uint pid;
                        GetWindowThreadProcessId(hwnd, out pid);
                        string procName = "";
                        try {
                            procName = Process.GetProcessById((int)pid).ProcessName;
                        } catch {}

                        writer.WriteLine(string.Format("{{\"ok\":true,\"hwnd\":{0},\"title\":\"{1}\",\"processName\":\"{2}\",\"pid\":{3}}}",
                            hwnd.ToInt64(), EscapeJson(title), EscapeJson(procName), pid));
                    }
                    else if (cmd == "FOCUS_HWND") {
                        long hwndVal = long.Parse(parts[1]);
                        IntPtr hwnd = new IntPtr(hwndVal);
                        bool ok = RobustFocusWindow(hwnd);
                        writer.WriteLine(string.Format("{{\"ok\":{0}}}", ok ? "true" : "false"));
                    }
                    else if (cmd == "FOCUS_QUERY") {
                        string[] queries = new string[parts.Length - 1];
                        Array.Copy(parts, 1, queries, 0, parts.Length - 1);

                        IntPtr hwnd = FindWindowByQueries(queries);
                        if (hwnd != IntPtr.Zero) {
                            RobustFocusWindow(hwnd);
                            writer.WriteLine(string.Format("{{\"ok\":true,\"hwnd\":{0}}}", hwnd.ToInt64()));
                        } else {
                            writer.WriteLine("{\"ok\":false,\"reason\":\"Window not found\"}");
                        }
                    }
                    else if (cmd == "FOCUS_AND_SEND_B64") {
                        long hwndVal = long.Parse(parts[1]);
                        string b64 = parts[2];
                        IntPtr hwnd = IntPtr.Zero;

                        if (hwndVal != 0 && IsWindow(new IntPtr(hwndVal))) {
                            hwnd = new IntPtr(hwndVal);
                        }

                        if (hwnd == IntPtr.Zero && parts.Length > 3) {
                            string[] queries = new string[parts.Length - 3];
                            Array.Copy(parts, 3, queries, 0, parts.Length - 3);
                            hwnd = FindWindowByQueries(queries);
                        }

                        if (hwnd != IntPtr.Zero) {
                            RobustFocusWindow(hwnd);
                            Thread.Sleep(120);
                        }

                        byte[] bytes = Convert.FromBase64String(b64);
                        string text = Encoding.UTF8.GetString(bytes);
                        SendStringAtomic(text);

                        writer.WriteLine(string.Format("{{\"ok\":true,\"hwnd\":{0}}}", hwnd.ToInt64()));
                    }
                    else if (cmd == "SEND_B64") {
                        string b64 = parts.Length > 1 ? parts[1] : "";
                        byte[] bytes = Convert.FromBase64String(b64);
                        string text = Encoding.UTF8.GetString(bytes);
                        SendStringAtomic(text);
                        writer.WriteLine("{\"ok\":true}");
                    }
                    else if (cmd == "IS_WINDOW") {
                        long hwndVal = long.Parse(parts[1]);
                        IntPtr hwnd = new IntPtr(hwndVal);
                        bool ok = IsWindow(hwnd);
                        writer.WriteLine(string.Format("{{\"ok\":true,\"valid\":{0}}}", ok ? "true" : "false"));
                    }
                    else if (cmd == "LIST_WINDOWS") {
                        List<string> list = new List<string>();
                        EnumWindows(delegate(IntPtr hWnd, IntPtr lParam) {
                            if (IsWindowVisible(hWnd) || IsIconic(hWnd)) {
                                int len = GetWindowTextLength(hWnd);
                                if (len > 0) {
                                    StringBuilder sb = new StringBuilder(len + 1);
                                    GetWindowText(hWnd, sb, len + 1);
                                    string title = sb.ToString();
                                    if (!string.IsNullOrWhiteSpace(title) && title != "Program Manager") {
                                        uint pid;
                                        GetWindowThreadProcessId(hWnd, out pid);
                                        string pName = "";
                                        try {
                                            pName = Process.GetProcessById((int)pid).ProcessName;
                                        } catch {}
                                        list.Add(string.Format("{{\"hwnd\":{0},\"title\":\"{1}\",\"processName\":\"{2}\",\"pid\":{3}}}",
                                            hWnd.ToInt64(), EscapeJson(title), EscapeJson(pName), pid));
                                    }
                                }
                            }
                            return true;
                        }, IntPtr.Zero);
                        writer.WriteLine("[" + string.Join(",", list.ToArray()) + "]");
                    }
                    else if (cmd == "SCREENSHOT" || cmd == "SCREENSHOT_RECT" || cmd == "SCREENSHOT_POINT") {
                        int left = 0;
                        int top = 0;
                        int width = 0;
                        int height = 0;

                        if (cmd == "SCREENSHOT_POINT" && parts.Length >= 3) {
                            int cursorX = int.Parse(parts[1]);
                            int cursorY = int.Parse(parts[2]);
                            Point pt = new Point(cursorX, cursorY);
                            Screen targetScreen = Screen.FromPoint(pt);
                            if (targetScreen == null) targetScreen = Screen.PrimaryScreen;

                            left = targetScreen.Bounds.Left;
                            top = targetScreen.Bounds.Top;
                            width = targetScreen.Bounds.Width;
                            height = targetScreen.Bounds.Height;
                        }
                        else if (cmd == "SCREENSHOT_RECT" && parts.Length >= 5) {
                            left = int.Parse(parts[1]);
                            top = int.Parse(parts[2]);
                            width = int.Parse(parts[3]);
                            height = int.Parse(parts[4]);
                        } else {
                            left = GetSystemMetrics(SM_XVIRTUALSCREEN);
                            top = GetSystemMetrics(SM_YVIRTUALSCREEN);
                            width = GetSystemMetrics(SM_CXVIRTUALSCREEN);
                            height = GetSystemMetrics(SM_CYVIRTUALSCREEN);
                        }

                        if (width <= 0 || height <= 0) {
                            width = Screen.PrimaryScreen.Bounds.Width;
                            height = Screen.PrimaryScreen.Bounds.Height;
                            left = 0;
                            top = 0;
                        }

                        IntPtr hDesk = GetDesktopWindow();
                        IntPtr hDeskDC = GetWindowDC(hDesk);
                        IntPtr hMemDC = CreateCompatibleDC(hDeskDC);
                        IntPtr hBitmap = CreateCompatibleBitmap(hDeskDC, width, height);
                        IntPtr hOld = SelectObject(hMemDC, hBitmap);
                        BitBlt(hMemDC, 0, 0, width, height, hDeskDC, left, top, SRCCOPY);
                        SelectObject(hMemDC, hOld);

                        using (Bitmap bmp = Image.FromHbitmap(hBitmap)) {
                            using (MemoryStream ms = new MemoryStream()) {
                                bmp.Save(ms, ImageFormat.Png);
                                byte[] bytes = ms.ToArray();
                                string b64 = Convert.ToBase64String(bytes);
                                writer.WriteLine(string.Format("{{\"ok\":true,\"left\":{0},\"top\":{1},\"width\":{2},\"height\":{3},\"dataUrl\":\"data:image/png;base64,{4}\"}}",
                                    left, top, width, height, b64));
                            }
                        }

                        DeleteObject(hBitmap);
                        DeleteDC(hMemDC);
                        ReleaseDC(hDesk, hDeskDC);
                    }
                    else {
                        writer.WriteLine("{\"ok\":false,\"reason\":\"Unknown command\"}");
                    }
                } catch (Exception ex) {
                    writer.WriteLine(string.Format("{{\"ok\":false,\"error\":\"{0}\"}}", EscapeJson(ex.Message)));
                }
            }
        }
    }
}
