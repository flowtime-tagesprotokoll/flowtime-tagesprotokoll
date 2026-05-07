// Verhindert das zusätzliche Konsolenfenster unter Windows im Release-Modus.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    flowtime_tagesprotokoll_lib::run()
}
