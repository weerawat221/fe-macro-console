{
  "targets": [
    {
      "target_name": "sendinput_win32",
      "sources": ["addon.cc"],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"],
      "conditions": [
        ["OS=='win'", {
          "libraries": ["user32.lib", "shcore.lib"]
        }]
      ]
    }
  ]
}
