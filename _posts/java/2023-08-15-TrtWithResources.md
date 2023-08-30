---
title: Try with resources를 이용한 편리한 자원 해제
layout: story
category: java
tags: ["java"]
---

개발할때 리소스를 사용하고 반드시 해재 해줘야하는것들이 있다.
예를들어 JDBC를 사용할때 사용되는 ResultSet, Connection, PreparedStatement등이 있다.
기존에 try-catch-finally 문에서 close() 메소드를 호출해 자원을 해재했다면,
try-with-resources 문을 이용해 편리하게 자원을 해제해보자.

# try-catch-finally
```java
public void doSometing() {
    try {
        Connection conn = DriverManager.getConnection("...");
        PreparedStatement pstmt = con.prepareStatement("SELECT ... where id = ?");
        ps.setString(1, id);
        ResultSet rs = ps.executeQuery();
         ResultSet rs;
        /**
         * ...
         **/
    } catch(Exception e) {
        
    } finally {
        conn.close();
        pstmt.close();
        rs.clsoe();
    }
    
}
```
기존에 사용하던대로 try-catch-finally를 그대로 사용해도 문제는 없다 하지만 이것의 단점이라하면 
사용한것들을 하나하나 close() 메서드를 호출해서 해제해줘야하고 이로 인해 코드가 길어질 수 있다.
또 실수로 해제 해주지 않는다면 언젠간 프로그램에 문제가 생기기때문에 정신 차리고 해야한다.

하지만 이러한 단점들은 try-with-resources를 이용해 어느정도 보완 할 수 있다.

# try-with-resources 
try-with-resources는 위에 try-with-finally와 크게 다르지않다.
다르다하면 close() 메소드를 호출 할 것들을 try문 ()에서 생성해주면된다.
try-with-resources는 예외처리 후 인스턴스들의 close() 메소드를을 알아서 호출한다.
```java
public void doSometing() {
    try(
        Connection conn = DriverManager.getConnection("...");
        PreparedStatement pstmt = con.prepareStatement("SELECT ... where id = ?");
        ResultSet rs;
        /**
         * ...
         **/
    ) {
      
        ps.setString(1, id);
        rs = ps.executeQuery();
    } catch(e) {
        
    } 
}
```
이런식으로 코드를 작성하면 하나하나 close() 메소드를 호출해주지 않아도 되기떄문에 편리하고 코드도 짧아진다.

# try-with-resources 사용시 주의할점
try()안에서 선언한 구현체(객체)가 close() 메서드를 가지고 있다해도 모두 동작하는것은 아니다.
java.io.Closeable 인터페이스를 이용해 구현된 구현체에게만 적용된다.
그래서 본인이 구현한 구현체가 close()메서드를 호출해주고싶다면 해당 인터페이스를 이용해 구현해줘야한다.

# Closeable 인터페이스를 이용해 구현체 만들기

try-with-resources에서 사용하려면 반드시 java.io.Closeable 인터페이스를 이용해야한다
```java
// Abc.java
import java.io.Closeable;
import java.io.IOException;

public class Abc implements Closeable {

    @Override
    public void close() throws IOException {
        System.out.println("close method!");
    }

    public void doSometing() {
        System.out.println("do someting");
    }
}
```
```java
// Main.java
import java.io.IOException;

public class Main {
    public static void main(String[] args) throws IOException {
        try(Abc abc = new Abc()) {
            abc.doSometing();
        }
    }
}

// do someting
// close method! 
```
예외처리가 끝나고 실행될것들을 close메소드에 적어주면 알아서 실행해주는걸 볼 수 있다.
