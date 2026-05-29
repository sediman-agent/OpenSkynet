use crate::client::{ApiClient, BridgeResult};

impl ApiClient {
    pub async fn register_skill_schedule(
        &self,
        skill_name: &str,
        cron_expr: &str,
    ) -> BridgeResult<String> {
        let resp: serde_json::Value = self
            .call(
                "schedule.add",
                serde_json::json!({"skill_name": skill_name, "cron": cron_expr}),
            )
            .await?;
        Ok(resp["job_id"].as_str().unwrap_or("unknown").to_string())
    }
}
