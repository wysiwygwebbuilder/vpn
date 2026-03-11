module.exports = function (api) {
  api.cache(true);
  
  return {
    presets: [
      [
        'babel-preset-expo',
        {
          jsxImportSource: 'nativewind',
          lazyImports: true,
          disableImportExportTransform: false,
        },
      ],
      'nativewind/babel',
    ],
    plugins: [],
  };
};
