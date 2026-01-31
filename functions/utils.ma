# Utility Functions - ZenCleaner
# Global rules applicable to all sites

@global {
    # Common Ad Containers
    .ad-banner -> remove()
    .adsbox -> remove()
    [id^="google_ads"] -> remove()
    [id^="div-gpt-ad"] -> remove()
    
    # GDPR Cookie Banners (Example)
    # .cookie-consent -> remove()
    # #onetrust-banner-sdk -> remove()
}

# Variable Definitions (Example)
$ad_selectors = .ad, .advertisement, .sponsor
