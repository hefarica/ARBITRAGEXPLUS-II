
#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

// Definir rutas canónicas y legacy
const LEGACY_CONFIG_PATH = path.resolve(process.cwd(), 'mev-scan-config.json');
const CANONICAL_CONFIG_PATH = path.resolve(process.cwd(), 'mev-scanner-config.json');

function main() {
  console.log('✨ Iniciando migración de configuración de legacy a canónica...');

  // 1. Verificar si el archivo legacy existe
  if (!fs.existsSync(LEGACY_CONFIG_PATH)) {
    console.log('🟡 No se encontró el archivo de configuración legacy (mev-scan-config.json). No se requiere migración.');
    return;
  }

  // 2. Leer el contenido del archivo legacy
  let legacyConfig;
  try {
    const legacyContent = fs.readFileSync(LEGACY_CONFIG_PATH, 'utf-8');
    legacyConfig = JSON.parse(legacyContent);
    console.log('✅ Archivo legacy leído y parseado correctamente.');
  } catch (error) {
    console.error(`
      ❌ Error al leer o parsear el archivo legacy:
      ${error.message}

      Por favor, asegúrate de que el archivo tiene un formato JSON válido.
    `);
    process.exit(1);
  }

  // 3. Renombrar el archivo legacy a canónico
  try {
    fs.renameSync(LEGACY_CONFIG_PATH, CANONICAL_CONFIG_PATH);
    console.log(`✅ Archivo renombrado de "mev-scan-config.json" a "mev-scanner-config.json".`);
  } catch (error) {
    console.error(`
      ❌ Error al renombrar el archivo:
      ${error.message}

      Asegúrate de tener los permisos necesarios.
    `);
    process.exit(1);
  }

  // 4. Añadir el archivo canónico al .gitignore si no está presente
  const gitignorePath = path.resolve(process.cwd(), '.gitignore');
  try {
    let gitignoreContent = '';
    if (fs.existsSync(gitignorePath)) {
      gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
    }

    if (!gitignoreContent.includes('mev-scanner-config.json')) {
      fs.appendFileSync(gitignorePath, '\n# Configuraciones canónicas del motor MEV\nmev-scanner-config.json\n');
      console.log('✅ "mev-scanner-config.json" añadido al .gitignore.');
    } else {
      console.log('🟡 El archivo canónico ya estaba en .gitignore.');
    }
  } catch (error) {
    console.warn(`
      ⚠️ No se pudo actualizar el .gitignore. Por favor, añade "mev-scanner-config.json" manualmente.
      Error: ${error.message}
    `);
  }

  console.log('\n🎉 Migración completada con éxito.\n');
  console.log('👉 Ahora puedes usar "mev-scanner-config.json" como tu única fuente de verdad.');
}

main();

