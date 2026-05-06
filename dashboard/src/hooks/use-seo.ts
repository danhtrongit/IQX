import { useEffect } from 'react';

interface SEOConfig {
  title: string;
  description?: string;
  url?: string;
  image?: string;
  type?: 'website' | 'article';
}

export function useSEO({ title, description, url, image, type = 'website' }: SEOConfig) {
  useEffect(() => {
    // 1. Basic title
    document.title = title;
    
    // 2. Primary Meta tags
    const setMetaTag = (nameAttr: 'name' | 'property', nameValue: string, content: string) => {
      let tag = document.querySelector(`meta[${nameAttr}="${nameValue}"]`);
      if (!tag) {
        tag = document.createElement('meta');
        tag.setAttribute(nameAttr, nameValue);
        document.head.appendChild(tag);
      }
      tag.setAttribute('content', content);
    };

    setMetaTag('name', 'title', title);
    if (description) setMetaTag('name', 'description', description);
    
    // 3. Open Graph
    setMetaTag('property', 'og:title', title);
    if (description) setMetaTag('property', 'og:description', description);
    setMetaTag('property', 'og:type', type);
    
    if (url) {
      setMetaTag('property', 'og:url', url);
      // Canonical
      let linkCanonical = document.querySelector('link[rel="canonical"]');
      if (!linkCanonical) {
        linkCanonical = document.createElement('link');
        linkCanonical.setAttribute('rel', 'canonical');
        document.head.appendChild(linkCanonical);
      }
      linkCanonical.setAttribute('href', url);
    }
    
    if (image) {
      setMetaTag('property', 'og:image', image);
      setMetaTag('name', 'twitter:image', image);
    }
    
    // 4. Twitter
    setMetaTag('name', 'twitter:title', title);
    if (description) setMetaTag('name', 'twitter:description', description);
    setMetaTag('name', 'twitter:card', 'summary_large_image');
    
  }, [title, description, url, image, type]);
}
