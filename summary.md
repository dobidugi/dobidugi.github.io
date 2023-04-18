---
layout: post
title: Summary
permalink: /summary
---
<ul class="">
    {% for post in site.posts %}
    {% if post.categories contains "summary" %}
    <li>
        <h2><a href="{{ post.url }}">{{ post.title }}</a></h2>
        <p>{{ post.excerpt }}</p>
    </li>
    {% endif %}
    {% endfor%}
</ul>
