pub mod skills;
pub mod memory;
pub mod model;
pub mod provider;
pub mod doctor;
pub mod integration;
pub mod schedule;
pub mod sessions;
pub mod browser;
pub mod delegate;
pub mod system;
pub mod plan;
pub mod soul;
pub mod theming;
pub mod coder;
pub mod search;
pub mod checkpoint;
pub mod update;

use sediman_tui_core::command::{CommandRegistry, CommandCategory};

pub fn register_commands(registry: &mut CommandRegistry) {
    // Core
    registry.register(&system::CMD_HELP);
    registry.register(&system::CMD_EXIT);
    registry.register(&system::CMD_CLEAR);
    registry.register(&system::CMD_RESET);
    registry.register(&system::CMD_COMPRESS);
    registry.register(&system::CMD_STATUS);
    // Agent
    registry.register(&model::CMD_MODELS);
    registry.register(&provider::CMD_PROVIDER);
    registry.register(&plan::CMD_PLAN);
    registry.register(&soul::CMD_SOUL);
    registry.register(&theming::CMD_THEMES);
    registry.register(&coder::CMD_CODER);
    registry.register(&search::CMD_SEARCH);
    // Skills
    registry.register(&skills::CMD_SKILLS);
    // Memory
    registry.register(&memory::CMD_MEMORY);
    registry.register(&memory::CMD_REMEMBER);
    // Schedule
    registry.register(&schedule::CMD_SCHEDULE);
    // Sessions
    registry.register(&sessions::CMD_SESSIONS);
    // Browser
    registry.register(&browser::CMD_BROWSER);
    registry.register(&browser::CMD_SCREENSHOT);
    // Tasks
    registry.register(&delegate::CMD_DELEGATE);
    registry.register(&delegate::CMD_PARALLEL);
    // Checkpoint
    registry.register(&checkpoint::CMD_CHECKPOINT);
    registry.register(&checkpoint::CMD_CHECKPOINT_CREATE);
    registry.register(&checkpoint::CMD_CHECKPOINT_REVERT);
    registry.register(&checkpoint::CMD_REWIND);
    registry.register(&checkpoint::CMD_BRANCH);
    registry.register(&checkpoint::CMD_BRANCHES);
    // Integrations
    registry.register(&integration::CMD_CONNECT);
    // Utilities
    registry.register(&doctor::CMD_DOCTOR);
    registry.register(&update::CMD_UPDATE);
}

#[cfg(test)]
mod tests {
    use super::CommandCategory;

    #[test]
    fn test_register_commands_counts() {
        let mut registry = CommandRegistry::new();
        register_commands(&mut registry);
        let all = registry.all();
        assert_eq!(all.len(), 31);
    }

    #[test]
    fn test_register_commands_has_core_commands() {
        let mut registry = CommandRegistry::new();
        register_commands(&mut registry);
        assert!(registry.get("/help").is_some());
        assert!(registry.get("/exit").is_some());
        assert!(registry.get("/clear").is_some());
        assert!(registry.get("/reset").is_some());
        assert!(registry.get("/status").is_some());
        assert!(registry.get("/compress").is_some());
    }

    #[test]
    fn test_register_commands_aliases() {
        let mut registry = CommandRegistry::new();
        register_commands(&mut registry);
        assert!(registry.get("/quit").is_some());
        assert!(registry.get("/q").is_some());
    }

    #[test]
    fn test_register_commands_no_removed_commands() {
        let mut registry = CommandRegistry::new();
        register_commands(&mut registry);
        // These should NOT be registered anymore
        assert!(registry.get("/btw").is_none());
        assert!(registry.get("/color").is_none());
        assert!(registry.get("/rename").is_none());
        assert!(registry.get("/export").is_none());
        assert!(registry.get("/usage").is_none());
        assert!(registry.get("/record").is_none());
        assert!(registry.get("/stop").is_none());
        assert!(registry.get("/terminal").is_none());
        assert!(registry.get("/run-skill").is_none());
        assert!(registry.get("/schedule-add").is_none());
        assert!(registry.get("/schedule-remove").is_none());
        assert!(registry.get("/resume").is_none());
    }

    #[test]
    fn test_register_commands_no_duplicates() {
        let mut registry = CommandRegistry::new();
        register_commands(&mut registry);
        let all = registry.all();
        let names: Vec<&str> = all.iter().map(|c| c.name).collect();
        let mut unique = names.clone();
        unique.sort();
        unique.dedup();
        assert_eq!(names.len(), unique.len(), "Duplicate command names found");
    }
}

// ============================================================================
// Additional Comprehensive Command Tests
// ============================================================================

#[cfg(test)]
mod comprehensive_command_tests {
    use super::CommandCategory;

    #[test]
    fn test_all_command_categories_covered() {
        let mut registry = CommandRegistry::new();
        register_commands(&mut registry);
        
        let all = registry.all();
        let categories: std::collections::HashSet<_> = all.iter()
            .map(|c| c.category)
            .collect();
        
        // Verify we have commands in expected categories
        assert!(categories.iter().any(|c| matches!(c, CommandCategory::General)));
        assert!(categories.iter().any(|c| matches!(c, CommandCategory::Agent)));
        assert!(categories.iter().any(|c| matches!(c, CommandCategory::Skills)));
    }

    #[test]
    fn test_command_category_variants() {
        let categories = vec![
            CommandCategory::General,
            CommandCategory::Agent,
            CommandCategory::Skills,
            CommandCategory::Hub,
            CommandCategory::Browser,
            CommandCategory::Sessions,
            CommandCategory::Schedule,
            CommandCategory::Terminal,
            CommandCategory::Tasks,
            CommandCategory::Utilities,
        ];
        assert_eq!(categories.len(), 10);
    }

    #[test]
    fn test_expected_command_count() {
        let mut registry = CommandRegistry::new();
        register_commands(&mut registry);
        let all = registry.all();
        // Should have at least 30 commands
        assert!(all.len() >= 30);
    }

    #[test]
    fn test_help_command_exists() {
        let mut registry = CommandRegistry::new();
        register_commands(&mut registry);
        assert!(registry.get("/help").is_some());
        assert!(registry.get("/h").is_some());
    }

    #[test]
    fn test_exit_command_and_aliases() {
        let mut registry = CommandRegistry::new();
        register_commands(&mut registry);
        assert!(registry.get("/exit").is_some());
        assert!(registry.get("/quit").is_some());
        assert!(registry.get("/q").is_some());
    }

    #[test]
    fn test_clear_reset_commands_exist() {
        let mut registry = CommandRegistry::new();
        register_commands(&mut registry);
        assert!(registry.get("/clear").is_some());
        assert!(registry.get("/reset").is_some());
        assert!(registry.get("/compress").is_some());
    }

    #[test]
    fn test_agent_commands_exist() {
        let mut registry = CommandRegistry::new();
        register_commands(&mut registry);
        assert!(registry.get("/models").is_some());
        assert!(registry.get("/provider").is_some());
        assert!(registry.get("/plan").is_some());
        assert!(registry.get("/soul").is_some());
    }

    #[test]
    fn test_skill_memory_commands_exist() {
        let mut registry = CommandRegistry::new();
        register_commands(&mut registry);
        assert!(registry.get("/skills").is_some());
        assert!(registry.get("/memory").is_some());
        assert!(registry.get("/remember").is_some());
    }

    #[test]
    fn test_browsing_commands_exist() {
        let mut registry = CommandRegistry::new();
        register_commands(&mut registry);
        assert!(registry.get("/browser").is_some());
        assert!(registry.get("/screenshot").is_some());
    }

    #[test]
    fn test_checkpoint_commands_exist() {
        let mut registry = CommandRegistry::new();
        register_commands(&mut registry);
        assert!(registry.get("/checkpoint").is_some());
        assert!(registry.get("/rewind").is_some());
        assert!(registry.get("/branches").is_some());
    }

    #[test]
    fn test_status_command_exists() {
        let mut registry = CommandRegistry::new();
        register_commands(&mut registry);
        assert!(registry.get("/status").is_some());
    }
}
