#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod lib;

fn main() {
    lib::run()
}
