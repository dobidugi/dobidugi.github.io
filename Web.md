---
layout: post
title: Web
permalink: /web
---
<ul class="">
    {% for post in site.posts %}
    {% if post.categories contains "web" %}
    <li>
        <h2><a href="{{ post.url }}">{{ post.title }}</a></h2>
        <p>{{ post.excerpt }}</p>
    </li>
    {% endif %}
    {% endfor%}
</ul>
