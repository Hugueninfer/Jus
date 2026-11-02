import Encore from '@symfony/webpack-encore';

if (!Encore.isRuntimeEnvironmentConfigured()) {
  Encore.configureRuntimeEnvironment(process.env.NODE_ENV || 'dev');
}

Encore
  .setOutputPath('public/build/')
  .setPublicPath('/build')
  .addEntry('app', './assets/app.ts')
  .splitEntryChunks()
  .enableSingleRuntimeChunk()
  .cleanupOutputBeforeBuild()
  .enableSourceMaps(!Encore.isProduction())
  .enableVersioning(Encore.isProduction())
  .enableTypeScriptLoader()
  .enableSassLoader((options) => {
    // Bootstrap 5.3 still relies on @import; keep the build output free of its deprecation noise.
    options.sassOptions = {
      quietDeps: true,
      silenceDeprecations: ['import'],
    };
  });

const config = await Encore.getWebpackConfig();

// The full Bootstrap stylesheet and the icon font put the entry over webpack's default size budget; that is accepted for
// now. Encore already silences the hints, but the summary still marks the entry as [big], which reads like a failure.
config.performance = false;

export default config;
