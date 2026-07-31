output "d1_database_id_prod" {
  description = "Production D1 ID, substituted into the Wrangler deploy config"
  value       = cloudflare_d1_database.prod.id
}
