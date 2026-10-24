/* iOS 27 stops an app at launch unless it uses the scene life cycle (UIKit asserts in
   _UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption). Expo 57 ships the scene delegate for it,
   ExpoAppSceneDelegate, but its template doesn't turn it on yet. This does, each time the native project is generated:
   Info.plist names the scene delegate, and the AppDelegate hands it the React Native factory instead of making the
   window and starting React Native itself (the scene delegate makes the window from its scene and starts it there). */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

const START = /\n#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\([^)]*\)\n#endif\n/;

module.exports = function withSceneLifecycle(config) {
  config = withInfoPlist(config, (cfg) => {
    cfg.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [{ UISceneConfigurationName: 'Default Configuration', UISceneDelegateClassName: 'EXExpoAppSceneDelegate' }],
      },
    };
    return cfg;
  });
  return withAppDelegate(config, (cfg) => {
    let s = cfg.modResults.contents;
    s = s.replace('class AppDelegate: ExpoAppDelegate {', 'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {');
    s = s.replace(START, '\n    // the window is made, and React Native started in it, by the scene delegate (ExpoAppSceneDelegate)\n');
    if (!s.includes('ExpoReactNativeFactoryProvider') || s.includes('factory.startReactNative(')) {
      throw new Error('with-scene-lifecycle: the AppDelegate template changed; update this plugin');
    }
    cfg.modResults.contents = s;
    return cfg;
  });
};
