---
# Feel free to add content and custom Front Matter to this file.
# To modify the layout, see https://jekyllrb.com/docs/themes/#overriding-theme-defaults

layout: default
title: {{ site.name }}
---
{% for category in site.categories %}
<h1><a href="/{{category[0]}}">{{ category[0] }}</a></h1>
<ul>
  {% for post in category[1] limit: 2%}
  <li>
    <h2><a href="{{ post.url }}">{{ post.title }}</a></h2>
    <p>{{ post.excerpt }}</p>
  </li>
  {% endfor %}
</ul>
{% endfor %}