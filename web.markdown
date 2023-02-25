---
layout: default
title: Web
permalink: /web/
---

{% for post in site.posts %}
<ul class="post-list">
    <li>
        <h3>
            <a class="post-link" href='{{ post.url }}'>
                {{ post.title }}
            </a>
        </h3>
        <!-- <span class="post-meta"></span> -->
    </li>
</ul>
    
{% endfor%}
