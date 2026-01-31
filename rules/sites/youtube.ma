# YouTube Rules - ZenCleaner
# Automatically generated example based on MaEngine syntax

@domain(youtube.com) {
    # Remove Homepage Ads
    ytd-ad-slot-renderer -> remove()
    ytd-rich-item-renderer:has(.ytd-ad-slot-renderer) -> remove()
    
    # Remove Video Player Ads
    .video-ads -> remove()
    .ytp-ad-overlay-container -> remove()
    
    # Auto Click Skip Button
    .ytp-ad-skip-button -> click()
    .ytp-ad-skip-button-modern -> click()
    
    # Remove Promoted Videos
    ytd-promoted-sparkles-web-renderer -> remove()
    
    # Cleanup UI
    .ytd-banner-promo-renderer -> remove()
}
