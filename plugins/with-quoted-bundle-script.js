/* The React Native template's "Bundle React Native code and images" phase runs the path of react-native-xcode.sh
   from an unquoted `...` substitution, so the build breaks when the project path has a space ("Daily Journal App").
   This wraps it in a quoted "$(...)" each time the native project is generated. */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { withXcodeProject } = require('expo/config-plugins');

const UNQUOTED = /`(\\"\$NODE_BINARY\\" --print [^`]*?react-native-xcode\.sh'\\")`/;

module.exports = function withQuotedBundleScript(config) {
  return withXcodeProject(config, (cfg) => {
    const phases = cfg.modResults.hash.project.objects.PBXShellScriptBuildPhase ?? {};
    for (const phase of Object.values(phases)) {
      if (phase && typeof phase.shellScript === 'string') {
        phase.shellScript = phase.shellScript.replace(UNQUOTED, (_, run) => '\\"$(' + run + ')\\"');
      }
    }
    return cfg;
  });
};
