const fs = require('fs');
const path = require('path');

function patchFile(filePath, transforms) {
  if (!fs.existsSync(filePath)) {
    console.log(`[patch-expo-worklets] skip missing file: ${filePath}`);
    return;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;

  for (const transform of transforms) {
    content = transform(content);
  }

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`[patch-expo-worklets] patched ${filePath}`);
  } else {
    console.log(`[patch-expo-worklets] no changes needed for ${filePath}`);
  }
}

const root = process.cwd();

const expoModulesCoreBuildGradle = path.join(root, 'node_modules', 'expo-modules-core', 'android', 'build.gradle');
patchFile(expoModulesCoreBuildGradle, [
  (content) => {
    if (content.includes('def debugNativeLibsTask = workletsProject.tasks.findByName("mergeDebugNativeLibs")')) {
      return content;
    }

    const target = `  afterEvaluate {\n    println("Linking react-native-worklets native libs into expo-modules-core build tasks")\n    println(workletsProject.tasks.getByName("mergeDebugNativeLibs"))\n    println(workletsProject.tasks.getByName("mergeReleaseNativeLibs"))\n    tasks.getByName("buildCMakeDebug").dependsOn(workletsProject.tasks.getByName("mergeDebugNativeLibs"))\n    tasks.getByName("buildCMakeRelWithDebInfo").dependsOn(workletsProject.tasks.getByName("mergeReleaseNativeLibs"))\n  }`;

    const replacement = `  afterEvaluate {\n    println("Linking react-native-worklets native libs into expo-modules-core build tasks")\n    def debugNativeLibsTask = workletsProject.tasks.findByName("mergeDebugNativeLibs")\n    def releaseNativeLibsTask = workletsProject.tasks.findByName("mergeReleaseNativeLibs")\n    println(debugNativeLibsTask)\n    println(releaseNativeLibsTask)\n    if (debugNativeLibsTask != null && tasks.findByName("buildCMakeDebug") != null) {\n      tasks.getByName("buildCMakeDebug").dependsOn(debugNativeLibsTask)\n    }\n    if (releaseNativeLibsTask != null && tasks.findByName("buildCMakeRelWithDebInfo") != null) {\n      tasks.getByName("buildCMakeRelWithDebInfo").dependsOn(releaseNativeLibsTask)\n    }\n  }`;

    return content.replace(target, replacement);
  },
]);

const projectConfigurationKt = path.join(
  root,
  'node_modules',
  'expo-modules-core',
  'expo-module-gradle-plugin',
  'src',
  'main',
  'kotlin',
  'expo',
  'modules',
  'plugin',
  'ProjectConfiguration.kt'
);
patchFile(projectConfigurationKt, [
  (content) => {
    const marker = '    val publicationInfo = PublicationInfo(this)';
    if (!content.includes(marker) || content.includes('val releaseComponent = components.findByName("release")')) {
      return content;
    }

    const replacement = [
      '    val releaseComponent = components.findByName("release")',
      '    if (releaseComponent == null) {',
      '      logger.warn("Skipping Expo publication setup for ${project.path} because release SoftwareComponent is missing")',
      '      return@afterEvaluate',
      '    }',
      '',
      '    val publicationInfo = PublicationInfo(this)',
    ].join('\n');

    return content.replace(marker, replacement);
  },
]);
