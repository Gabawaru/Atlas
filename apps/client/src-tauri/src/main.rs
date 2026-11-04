//! Stub desktop Atlas — ne lance pas de contrôles.
//! Les contrôles passent uniquement par l'API / Policy Guard.
//! Binaire Windows livré dans `remote-work/bin/Atlas.exe` (cross-compile).

use std::io::{self, Write};

fn main() {
    println!("========================================");
    println!("  Atlas — client desktop (STUB)");
    println!("========================================");
    println!();
    println!("Ce binaire est un shell desktop message-only.");
    println!("Aucun contrôle / scan n'est exécuté ici.");
    println!();
    println!("Continuer le travail Atlas sur un autre PC Windows :");
    println!("  1. Site          https://atlas-secu.com");
    println!("  2. Repo          https://github.com/Gabawaru/Atlas");
    println!("  3. Pack remote   dossier remote-work/ (README + docs)");
    println!("  4. Releases      https://github.com/Gabawaru/Atlas/releases/latest");
    println!("  5. Secrets       coller UNIQUEMENT dans .env local (jamais git)");
    println!();
    println!("UI web supportée :");
    println!("  pnpm --filter @atlas/client run build && preview");
    println!("Tauri 2 complet : voir src-tauri/README.md et docs/tauri-stub.md");
    println!();
    print!("Appuyez sur Entrée pour quitter… ");
    let _ = io::stdout().flush();
    let mut line = String::new();
    let _ = io::stdin().read_line(&mut line);
}
