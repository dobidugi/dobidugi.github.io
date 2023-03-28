---
layout: post
title: Journal
permalink: /journal
---
<ul class="">
    {% for post in site.posts %}
    {% if post.categories contains "journal" %}
    <li>
        <h2><a href="{{ post.url }}">{{ post.title }}</a></h2>
        <p>{{ post.excerpt }}</p>
    </li>
    {% endif %}
    {% endfor%}
</ul>
