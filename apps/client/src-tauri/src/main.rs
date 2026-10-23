//! Stub desktop Atlas — ne lance pas de contrôles.
//! Les contrôles passent uniquement par l'API / Policy Guard.

fn main() {
    println!("Atlas client desktop — STUB");
    println!("Utilisez le client web : pnpm --filter @atlas/client run build && preview");
    println!("Tauri 2 : voir src-tauri/README.md et docs/tauri-stub.md");
    println!("Aucun contrôle n'est exécuté dans ce process UI.");
}
