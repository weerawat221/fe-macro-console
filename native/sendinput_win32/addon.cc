// addon.cc
// Native Win32 bridge for the FE Macro Console.
// Ports the same three syscalls the original Python/ctypes tool used:
//   - SendInput (KEYEVENTF_UNICODE) for keystroke injection
//   - GetForegroundWindow / SetForegroundWindow / ShowWindow for window targeting
//   - GetWindowTextW for the focus-tracking loop
//
// Built as an N-API addon so it stays ABI-stable across Electron/Node upgrades
// (unlike ffi-napi/ref-napi, which routinely breaks on new Node ABIs).

#include <napi.h>

#ifdef _WIN32
#include <windows.h>
#include <string>
#include <vector>
#endif

#ifdef _WIN32

// Sends a single unicode codepoint as a key-down + key-up pair (KEYEVENTF_UNICODE),
// mirroring send_key()/send_text() in the Python original.
void SendUnicodeChar(wchar_t ch) {
    INPUT inputs[2] = {};

    inputs[0].type = INPUT_KEYBOARD;
    inputs[0].ki.wVk = 0;
    inputs[0].ki.wScan = ch;
    inputs[0].ki.dwFlags = KEYEVENTF_UNICODE;

    inputs[1].type = INPUT_KEYBOARD;
    inputs[1].ki.wVk = 0;
    inputs[1].ki.wScan = ch;
    inputs[1].ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;

    SendInput(2, inputs, sizeof(INPUT));
}

// Sends a "real" virtual-key (used for Enter / Tab so target apps see actual
// VK_RETURN / VK_TAB rather than a unicode CR/TAB codepoint, exactly like the
// Python VK_RETURN / VK_TAB branch in send_text()).
void SendVirtualKey(WORD vk) {
    INPUT inputs[2] = {};

    inputs[0].type = INPUT_KEYBOARD;
    inputs[0].ki.wVk = vk;
    inputs[0].ki.dwFlags = 0;

    inputs[1].type = INPUT_KEYBOARD;
    inputs[1].ki.wVk = vk;
    inputs[1].ki.dwFlags = KEYEVENTF_KEYUP;

    SendInput(2, inputs, sizeof(INPUT));
}

#endif // _WIN32

// sendText(text: string): boolean
Napi::Value SendText(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

#ifndef _WIN32
    Napi::TypeError::New(env, "sendText is only available on Windows").ThrowAsJavaScriptException();
    return env.Null();
#else
    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "Expected a string argument").ThrowAsJavaScriptException();
        return env.Null();
    }

    std::u16string text = info[0].As<Napi::String>().Utf16Value();

    for (size_t i = 0; i < text.size(); ++i) {
        wchar_t ch = static_cast<wchar_t>(text[i]);
        if (ch == L'\n') {
            SendVirtualKey(VK_RETURN);
        } else if (ch == L'\t') {
            SendVirtualKey(VK_TAB);
        } else if (ch == L'\r') {
            continue; // swallow CR, same as Python which only special-cased \n and \t
        } else {
            SendUnicodeChar(ch);
        }
    }

    return Napi::Boolean::New(env, true);
#endif
}

// getForegroundWindowInfo(): { hwnd: number, title: string } | null
Napi::Value GetForegroundWindowInfo(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

#ifndef _WIN32
    return env.Null();
#else
    HWND hwnd = GetForegroundWindow();
    if (hwnd == nullptr) {
        return env.Null();
    }

    int length = GetWindowTextLengthW(hwnd);
    std::vector<wchar_t> buffer(length + 1, 0);
    GetWindowTextW(hwnd, buffer.data(), length + 1);

    Napi::Object result = Napi::Object::New(env);
    result.Set("hwnd", Napi::Number::New(env, reinterpret_cast<double>(hwnd)));
    result.Set("title", Napi::String::New(env, reinterpret_cast<const char16_t*>(buffer.data())));
    return result;
#endif
}

// focusWindow(hwnd: number): boolean
Napi::Value FocusWindow(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

#ifndef _WIN32
    return Napi::Boolean::New(env, false);
#else
    if (info.Length() < 1 || !info[0].IsNumber()) {
        Napi::TypeError::New(env, "Expected a numeric hwnd").ThrowAsJavaScriptException();
        return env.Null();
    }

    HWND hwnd = reinterpret_cast<HWND>(static_cast<intptr_t>(info[0].As<Napi::Number>().Int64Value()));

    if (!IsWindow(hwnd)) {
        return Napi::Boolean::New(env, false);
    }

    ShowWindow(hwnd, SW_SHOW);
    bool ok = SetForegroundWindow(hwnd) != 0;
    return Napi::Boolean::New(env, ok);
#endif
}

// isWindow(hwnd: number): boolean
Napi::Value IsWindowValid(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

#ifndef _WIN32
    return Napi::Boolean::New(env, false);
#else
    if (info.Length() < 1 || !info[0].IsNumber()) {
        return Napi::Boolean::New(env, false);
    }
    HWND hwnd = reinterpret_cast<HWND>(static_cast<intptr_t>(info[0].As<Napi::Number>().Int64Value()));
    return Napi::Boolean::New(env, IsWindow(hwnd) != 0);
#endif
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("sendText", Napi::Function::New(env, SendText));
    exports.Set("getForegroundWindowInfo", Napi::Function::New(env, GetForegroundWindowInfo));
    exports.Set("focusWindow", Napi::Function::New(env, FocusWindow));
    exports.Set("isWindow", Napi::Function::New(env, IsWindowValid));
    return exports;
}

NODE_API_MODULE(sendinput_win32, Init)
