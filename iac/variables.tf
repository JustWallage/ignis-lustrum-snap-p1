variable "cloudflare_api_token" {
  description = "Cloudflare API token with Workers and D1 permissions (no R2 needed)"
  type        = string
  sensitive   = true
}

variable "cloudflare_account_id" {
  description = "Cloudflare account ID"
  type        = string
}
