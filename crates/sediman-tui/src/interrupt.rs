use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

pub struct InterruptManager {
    triggered: Arc<AtomicBool>,
}

impl InterruptManager {
    pub fn new() -> Self {
        Self {
            triggered: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn trigger(&self) {
        self.triggered.store(true, Ordering::SeqCst);
    }

    pub fn clear(&self) {
        self.triggered.store(false, Ordering::SeqCst);
    }

    #[allow(dead_code)]
    pub fn is_triggered(&self) -> bool {
        self.triggered.load(Ordering::SeqCst)
    }

    pub fn flag(&self) -> Arc<AtomicBool> {
        self.triggered.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_not_triggered() {
        let im = InterruptManager::new();
        assert!(!im.is_triggered());
    }

    #[test]
    fn test_trigger_sets_flag() {
        let im = InterruptManager::new();
        im.trigger();
        assert!(im.is_triggered());
    }

    #[test]
    fn test_clear_resets_flag() {
        let im = InterruptManager::new();
        im.trigger();
        assert!(im.is_triggered());
        im.clear();
        assert!(!im.is_triggered());
    }

    #[test]
    fn test_trigger_twice_stays_triggered() {
        let im = InterruptManager::new();
        im.trigger();
        im.trigger();
        assert!(im.is_triggered());
    }

    #[test]
    fn test_clear_on_clean_state() {
        let im = InterruptManager::new();
        im.clear();
        assert!(!im.is_triggered());
    }

    #[test]
    fn test_trigger_after_clear() {
        let im = InterruptManager::new();
        im.trigger();
        im.clear();
        assert!(!im.is_triggered());
        im.trigger();
        assert!(im.is_triggered());
    }

    #[test]
    fn test_thread_safety() {
        let im = std::sync::Arc::new(InterruptManager::new());
        let im2 = im.clone();
        std::thread::spawn(move || {
            im2.trigger();
        })
        .join()
        .unwrap();
        assert!(im.is_triggered());
    }

    #[test]
    fn test_flag_shares_state() {
        let im = InterruptManager::new();
        let flag = im.flag();
        im.trigger();
        assert!(flag.load(Ordering::SeqCst));
        flag.store(false, Ordering::SeqCst);
        assert!(!im.is_triggered());
    }
}
