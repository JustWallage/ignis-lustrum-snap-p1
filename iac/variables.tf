variable "cloudflare_api_token" {
  description = "Cloudflare API token with Workers, D1 and R2 permissions"
  type        = string
  sensitive   = true
}

variable "cloudflare_account_id" {
  description = "Cloudflare account ID"
  type        = string
}
